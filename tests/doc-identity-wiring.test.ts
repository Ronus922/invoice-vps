import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Every road into the `invoices` table asks the SAME identity question (src/lib/doc-identity.ts). The behaviour of each
// is tested with fakes (find-duplicate-document, invoices-post-route, scan-save); the Gmail scan, the browser-side
// pre-checks and the early warning cannot be run here, so this pins that each of them still goes through the shared code
// and has not grown a rule of its own again (the old key: vendor + doc_number + doc_type).

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

describe('the identity is asked the same way at every entry point', () => {
  it('Gmail scan: findDuplicateDocument, not its own (vendor, doc_number, doc_type) query', () => {
    const src = read('src/app/api/scan-gmail/route.ts')
    expect(src).toMatch(/await findDuplicateDocument\(supabase,/)
    expect(src).not.toMatch(/duplicateQuery/)
    expect(src).not.toMatch(/\.eq\('doc_type', extracted\.doc_type\)/)
    // lookup + insert run as one step per document, so two copies in one batch cannot both pass the lookup
    expect(src).toMatch(/await withKeyLock\(\s*identity \? identityKey\(identity\) : null,/)
    expect(src.indexOf('withKeyLock(')).toBeLessThan(src.indexOf('findDuplicateDocument(supabase,'))
    expect(src.indexOf('findDuplicateDocument(supabase,')).toBeLessThan(src.indexOf(".from('invoices')\n          .insert(insertPayload)"))
  })

  it('the own-mail skip never overwrites an earlier scan record of the message', () => {
    expect(read('src/app/api/scan-gmail/route.ts')).toMatch(/own_accountant_send:\$\{ownSend\}`\s*\},\s*\], true\)/)
  })

  it('POST /api/invoices (manual upload, folder scan, any client insert): findDuplicateDocument before the insert', () => {
    const src = read('src/app/api/invoices/route.ts')
    expect(src).toMatch(/await findDuplicateDocument\(supabase, payload\)/)
    expect(src.indexOf('findDuplicateDocument(supabase, payload)')).toBeLessThan(src.indexOf(".from('invoices')\n    .insert(payload)"))
  })

  it('phone scan: the store looks up by the identity, and the early warning sends number, date, total and tax id', () => {
    expect(read('src/lib/scan/store.ts')).toMatch(/findDuplicateDocument\(db,/)
    expect(read('src/app/api/scan/duplicate/route.ts')).toMatch(/total: parseAmount\(/)
    const step = read('src/components/scan/ScanStep.tsx')
    expect(step).toMatch(/doc_number: values\.doc_number, date: values\.date, total: values\.total, vendor_tax_id: values\.vendor_tax_id/)
    expect(step).not.toMatch(/vendor: values\.vendor, doc_number/)
  })

  it('upload zone and folder scan: the in-memory pre-check is findDuplicateInList, not an inline vendor comparison', () => {
    for (const file of ['src/components/invoices/UploadZone.tsx', 'src/lib/folder-watch.ts']) {
      const src = read(file)
      expect(src, file).toMatch(/findDuplicateInList\(/)
      expect(src, file).not.toMatch(/inv\.vendor === extracted\.vendor/)
    }
  })

  it('the unique index on the identity exists as a migration — CONCURRENTLY, outside any transaction, mirroring doc-identity.ts', () => {
    const sql = read('supabase/migrations/20261110_add_document_identity_index.sql')
    const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n') // comments out
    expect(code).toMatch(/CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS invoices_document_identity_uniq\s+ON public\.invoices \(/)
    expect(code).not.toMatch(/\b(BEGIN|COMMIT|START TRANSACTION)\b/i) // CONCURRENTLY cannot run inside a transaction
    expect(code).not.toMatch(/\bWHERE\b/i) // not partial: every row with an identity is covered
    // the three parts of the key, as normalizeDocNumber / normalizeDocDate / totalToCents compute them
    expect(code).toContain("upper(normalize(doc_number, NFKC))")
    expect(code).toContain("'[^[:alnum:]]'")
    expect(code).toContain("ltrim(")
    expect(code).toContain("round(total * 100)")
    expect(code).toMatch(/<\?unknown>\?/) // a missing date is '<UNKNOWN>' in the table
    // neither the vendor nor the doc_type is in the key
    expect(code).not.toMatch(/\b(vendor|doc_type|vendor_tax_id)\b/)
    expect(read('docs/document-identity.md')).toMatch(/invoices_document_identity_uniq/)
  })

  it('every writer reports a unique-index hit (23505) as a duplicate, and an edit answers 409', () => {
    expect(read('src/app/api/invoices/route.ts')).toMatch(/error\.code === '23505'[\s\S]{0,900}duplicate: true/)
    expect(read('src/app/api/invoices/route.ts')).toMatch(/error\.code === '23505'[\s\S]{0,600}status: 409/)
    expect(read('src/app/api/scan-gmail/route.ts')).toMatch(/insertError\.code === '23505'[\s\S]{0,200}status: 'duplicate'/)
    expect(read('src/lib/scan/store.ts')).toMatch(/23505[\s\S]{0,80}duplicate:\s*true/)
  })
})
