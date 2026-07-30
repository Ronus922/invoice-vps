#!/usr/bin/env npx tsx
// One-off triage: re-judge every invoice flagged 'מסמך שאינו חשבונית — לבדיקה'
// with the CURRENT (fixed) extraction prompt, then:
//   - bookable verdict  → keep, set the new doc_type, recompute needs_review
//                         from the stored amounts (released rows are sent by
//                         the nightly drain / the red banner)
//   - non-invoice again → delete the row AND its storage object (two votes:
//                         the original pass and this stricter pass agree)
// Run: npx tsx scripts/retriage-flagged.ts            (dry run)
//      npx tsx scripts/retriage-flagged.ts --apply    (execute)
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import {
  INVOICE_EXTRACTION_PROMPT,
  INVOICE_EXTRACTION_MODEL,
  INVOICE_EXTRACTION_MAX_TOKENS,
  EXTRACTION_TOOL,
} from '../src/lib/invoice-extraction-prompt'
import { normalizeDocType, isNonInvoiceDocType, NON_INVOICE_REVIEW_MESSAGE } from '../src/lib/doc-type'
import { validateInvoiceArithmetic } from '../src/lib/invoice-validation'
import { storagePathFromFileUrl } from '../src/lib/file-url'

for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const APPLY = process.argv.includes('--apply')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 4 })

const EXT_MEDIA: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

interface Row {
  id: string
  vendor: string
  doc_number: string
  total: number
  pretax: number | null
  vat: number | null
  file_url: string | null
  file_name: string | null
  date: string | null
}

async function judge(row: Row): Promise<{ docType: string; total: number | null; docNumber: string } | null> {
  const path = row.file_url ? storagePathFromFileUrl(row.file_url) : null
  if (!path) return null
  const ext = path.toLowerCase().split('.').pop() || ''
  const media = EXT_MEDIA[ext]
  if (!media) return null
  const { data, error } = await supabase.storage.from('invoice-files').download(path)
  if (error || !data) return null
  const b64 = Buffer.from(await data.arrayBuffer()).toString('base64')
  const isPdf = media === 'application/pdf'
  const result = await anthropic.messages.create({
    model: INVOICE_EXTRACTION_MODEL,
    max_tokens: INVOICE_EXTRACTION_MAX_TOKENS,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: 'tool', name: EXTRACTION_TOOL.name },
    messages: [
      {
        role: 'user',
        content: [
          isPdf
            ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf', data: b64 } }
            : {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: media as 'image/jpeg' | 'image/png' | 'image/webp',
                  data: b64,
                },
              },
          { type: 'text' as const, text: INVOICE_EXTRACTION_PROMPT },
        ],
      },
    ],
  })
  const tool = result.content.find((b) => b.type === 'tool_use')
  if (!tool || !('input' in tool)) return null
  const input = tool.input as { doc_type?: unknown; total?: unknown; doc_number?: unknown }
  return {
    docType: normalizeDocType(input.doc_type),
    total: typeof input.total === 'number' ? input.total : null,
    docNumber: String(input.doc_number ?? '').trim(),
  }
}

async function main() {
  const { data: rows, error } = await supabase
    .from('invoices')
    .select('id, vendor, doc_number, total, pretax, vat, file_url, file_name, date')
    .eq('needs_review', true)
    .eq('validation_error', NON_INVOICE_REVIEW_MESSAGE)
    .order('created_at', { ascending: true })
  if (error) throw error

  console.log(`${rows!.length} flagged rows to re-judge (${APPLY ? 'APPLY' : 'dry run'})`)
  const kept: string[] = []
  const deleted: string[] = []
  const manual: string[] = []

  const BATCH = 3
  for (let i = 0; i < rows!.length; i += BATCH) {
    await Promise.all(
      rows!.slice(i, i + BATCH).map(async (row: Row) => {
        const label = `${row.vendor || '?'} · ${row.file_name || row.id} · ₪${row.total}`
        let verdict: Awaited<ReturnType<typeof judge>> = null
        try {
          verdict = await judge(row)
        } catch (err) {
          console.error(`  ! judge failed: ${label}:`, err instanceof Error ? err.message : err)
        }
        if (!verdict) {
          manual.push(label)
          console.log(`  ? manual  ${label}`)
          return
        }
        const hasSignal = (verdict.total ?? 0) > 0 || Boolean(verdict.docNumber) || row.total > 0
        const bookable = !isNonInvoiceDocType(verdict.docType) && (verdict.docType !== 'unknown' || hasSignal)
        if (bookable) {
          const validation = validateInvoiceArithmetic({ pretax: row.pretax, vat: row.vat, total: row.total })
          kept.push(`${label} → ${verdict.docType}${validation.ok ? '' : ' (עדיין לבדיקת סכומים)'}`)
          console.log(`  ✓ keep    ${label} → ${verdict.docType}`)
          if (APPLY) {
            const { error: upErr } = await supabase
              .from('invoices')
              .update({
                doc_type: verdict.docType,
                needs_review: !validation.ok,
                validation_error: validation.reason,
                updated_at: new Date().toISOString(),
              })
              .eq('id', row.id)
            if (upErr) console.error(`  ! update failed ${row.id}:`, upErr.message)
          }
        } else {
          deleted.push(label)
          console.log(`  ✗ delete  ${label} (${verdict.docType})`)
          if (APPLY) {
            const { error: delErr } = await supabase.from('invoices').delete().eq('id', row.id)
            if (delErr) {
              console.error(`  ! delete failed ${row.id}:`, delErr.message)
              return
            }
            const path = row.file_url ? storagePathFromFileUrl(row.file_url) : null
            if (path) await supabase.storage.from('invoice-files').remove([path])
          }
        }
      })
    )
  }

  console.log(`\nSummary: kept=${kept.length} deleted=${deleted.length} manual=${manual.length}`)
  if (deleted.length) console.log('\nDeleted (non-invoices):\n' + deleted.map((s) => `  - ${s}`).join('\n'))
  if (manual.length) console.log('\nNeeds manual look:\n' + manual.map((s) => `  - ${s}`).join('\n'))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
