#!/usr/bin/env node
// ONE-OFF: re-extract the 11 unbalanced legacy invoices from their source files
// using the app's exact prompt + model. Prints a before/after table and writes
// backups/reextract-<stamp>.json. Does NOT touch the DB (approval gate).
import { loadEnv, psql, repoRoot } from './_lib.mjs'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

loadEnv()
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Private bucket — resolve each stored file_url to a short-lived signed URL,
// same as src/lib/storage.ts resolveFileUrl().
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const BUCKET = 'invoice-files'
async function signed(fileUrl) {
  const marker = `/${BUCKET}/`
  const i = fileUrl.indexOf(marker)
  if (i === -1) return fileUrl.startsWith('http') ? fileUrl : null
  const path = fileUrl.slice(i + marker.length)
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, 120)
  return data?.signedUrl ?? null
}

// Pull the exact prompt/model/max_tokens from the source (no drift, no dup).
const promptSrc = readFileSync(join(repoRoot(), 'src/lib/invoice-extraction-prompt.ts'), 'utf8')
const PROMPT = promptSrc.match(/INVOICE_EXTRACTION_PROMPT = `([\s\S]*?)`/)[1]
const MODEL = promptSrc.match(/INVOICE_EXTRACTION_MODEL = '([^']+)'/)[1]
const MAX = Number(promptSrc.match(/INVOICE_EXTRACTION_MAX_TOKENS = (\d+)/)[1])

const TOOL = {
  name: 'return_invoice',
  description: 'Return the extracted invoice fields.',
  input_schema: {
    type: 'object',
    properties: {
      date: { type: 'string' }, vendor: { type: 'string' }, doc_number: { type: 'string' },
      description: { type: 'string' }, currency: { type: 'string' },
      pretax: { type: ['number', 'null'] }, vat: { type: ['number', 'null'] }, total: { type: ['number', 'null'] },
      payment_method: { type: 'string' }, category: { type: 'string' },
    },
    required: ['date', 'vendor', 'total', 'currency'],
  },
}

const rows = psql(`
  select id||'\t'||vendor||'\t'||coalesce(doc_number,'')||'\t'||coalesce(pretax::text,'')||'\t'||coalesce(vat::text,'')||'\t'||coalesce(total::text,'')||'\t'||coalesce(currency,'')||'\t'||file_url
  from public.invoices
  where needs_review=false and (
    (total is null or total<=0) or
    (pretax is not null and vat is not null and abs((pretax+vat)-total)>greatest(0.05,total*0.005)))
  order by created_at`).split('\n').filter(Boolean).map((l) => {
  const [id, vendor, doc_number, pretax, vat, total, currency, file_url] = l.split('\t')
  return { id, vendor, doc_number, pretax, vat, total, currency, file_url }
})

const bal = (p, v, t) => (t != null && t > 0 && (p == null || v == null || Math.abs(p + v - t) <= Math.max(0.05, t * 0.005)))
const results = []

for (const r of rows) {
  process.stdout.write(`\n▶ ${r.vendor} / ${r.doc_number} … `)
  try {
    const fetchUrl = await signed(r.file_url)
    if (!fetchUrl) throw new Error('no signed url')
    const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) throw new Error(`fetch HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const ct = res.headers.get('content-type') || ''
    const isPdf = r.file_url.toLowerCase().endsWith('.pdf') || ct.includes('pdf')
    let mt = 'image/jpeg'
    if (ct.includes('png')) mt = 'image/png'
    else if (ct.includes('webp')) mt = 'image/webp'
    const block = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } }
      : { type: 'image', source: { type: 'base64', media_type: mt, data: buf.toString('base64') } }

    const out = await anthropic.messages.create({
      model: MODEL, max_tokens: MAX, tools: [TOOL], tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content: [block, { type: 'text', text: PROMPT }] }],
    })
    const tb = out.content.find((b) => b.type === 'tool_use')
    const d = tb?.input || {}
    const nn = (x) => (typeof x === 'number' ? x : x == null ? null : Number(x))
    const np = nn(d.pretax), nv = nn(d.vat), nt = nn(d.total)
    const rec = {
      id: r.id, vendor: r.vendor, doc_number: r.doc_number,
      old: { pretax: r.pretax, vat: r.vat, total: r.total, currency: r.currency },
      new: { pretax: np, vat: nv, total: nt, currency: d.currency, vendor: d.vendor, date: d.date, doc_number: d.doc_number },
      new_balanced: bal(np, nv, nt),
    }
    results.push(rec)
    process.stdout.write(
      `old ${r.pretax}+${r.vat}=${r.total} → new ${np}+${nv}=${nt} ${d.currency}  ${rec.new_balanced ? '✓ מאוזן' : '✗ עדיין לא'}`
    )
  } catch (err) {
    results.push({ id: r.id, vendor: r.vendor, doc_number: r.doc_number, error: String(err.message || err) })
    process.stdout.write(`שגיאה: ${err.message || err}`)
  }
}

const dir = join(repoRoot(), 'backups')
mkdirSync(dir, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outFile = join(dir, `reextract-${stamp}.json`)
writeFileSync(outFile, JSON.stringify(results, null, 2))
console.log(`\n\n=== סיכום ===`)
console.log(`מאוזנות אחרי חילוץ מחדש: ${results.filter((r) => r.new_balanced).length}/${results.length}`)
console.log(`עדיין לא מאוזנות: ${results.filter((r) => !r.new_balanced && !r.error).length}`)
console.log(`שגיאות: ${results.filter((r) => r.error).length}`)
console.log(`נשמר: ${outFile}`)
