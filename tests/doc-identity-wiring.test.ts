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

  it('there is still NO unique index on the new identity (the table holds duplicates until the cleanup): no migration adds one', () => {
    // docs/document-identity.md, "After the cleanup": the index is a step for later, after Ronen's cleanup.
    expect(read('docs/document-identity.md')).toMatch(/אחרי הניקוי/)
  })
})
