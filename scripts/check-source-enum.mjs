#!/usr/bin/env node
// INVARIANT: the invoice `source` values accepted by the app match the DB CHECK
//   constraint exactly. If code adds a source (e.g. 'email') the DB CHECK didn't
//   learn, every such insert is silently rejected; if the DB drops one the code
//   still sends, same. Both sides are parsed from their source-of-truth files.
// Static — reads files only, no DB.
import { run, repoRoot, fail, ok } from './_lib.mjs'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

run('check-source-enum', async () => {
  const root = repoRoot()

  // DB side — last migration that (re)defines invoices_source_check wins.
  const migDir = join(root, 'supabase/migrations')
  let dbValues = null
  for (const f of readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(migDir, f), 'utf8')
    const m = sql.match(/invoices_source_check[\s\S]*?ARRAY\[([\s\S]*?)\]/i)
    if (m) dbValues = new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]))
  }
  if (!dbValues) return fail('לא נמצא CHECK של invoices_source_check ב-migrations')

  // Code side — z.enum for source in the invoices route.
  const route = readFileSync(join(root, 'src/app/api/invoices/route.ts'), 'utf8')
  const em = route.match(/source:\s*z\.enum\(\[([\s\S]*?)\]\)/)
  if (!em) return fail('לא נמצא `source: z.enum([...])` ב-route של invoices')
  const codeValues = new Set([...em[1].matchAll(/'([^']+)'/g)].map((x) => x[1]))

  const missingInCode = [...dbValues].filter((v) => !codeValues.has(v))
  const missingInDb = [...codeValues].filter((v) => !dbValues.has(v))
  if (missingInCode.length) fail('ב-DB CHECK אך לא ב-z.enum: ' + missingInCode.join(', '))
  if (missingInDb.length) fail('ב-z.enum אך לא ב-DB CHECK: ' + missingInDb.join(', '))
  if (!missingInCode.length && !missingInDb.length) {
    ok(`enum הקוד תואם ל-DB CHECK {${[...dbValues].sort().join(', ')}}`)
  }
})
