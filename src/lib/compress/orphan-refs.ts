import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { READ_ONLY_PGOPTIONS, type Exec } from './cli'
import { chunk } from './orphans'

// "Does the database mention this object name ANYWHERE?" — asked of every column of every table in the app's schema,
// not just invoices.file_url. The comparison happens inside Postgres (a read-only session): no column value is ever
// returned, only the names that matched, so a token column is scanned without being read.

const run = promisify(execFile)
const realExec: Exec = (file, args, env) => run(file, args, { env: env as NodeJS.ProcessEnv, maxBuffer: 16 * 1024 * 1024 })

/** Escapes a literal for a Postgres regular expression. */
export const escapeRegex = (s: string): string => s.replace(/[\\^$.|?*+()[\]{}]/g, '\\$&')
const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`
const ident = (s: string): string => `"${s.replace(/"/g, '""')}"`

/** One alternation that matches any of the names, either spelled as-is or percent-encoded (a stored URL may carry %20). */
export function mentionPattern(names: readonly string[]): string {
  const spellings = new Set<string>()
  for (const n of names) {
    spellings.add(n)
    spellings.add(encodeURIComponent(n))
  }
  return `(${[...spellings].map(escapeRegex).join('|')})`
}

/** Step 1: which (table, column) pairs contain at least one of the names. */
export function columnsWithHitsSql(pattern: string, schema = 'public'): string {
  return `select c.table_name || '|' || c.column_name
from information_schema.columns c
join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
where c.table_schema = ${lit(schema)} and t.table_type = 'BASE TABLE'
  and (xpath('/row/c/text()', query_to_xml(format('select count(*)::int as c from %I.%I where %I::text ~ %L', c.table_schema, c.table_name, c.column_name, ${lit(pattern)}), false, true, '')))[1]::text::int > 0`
}

/** Step 2: which names matched, in the columns step 1 found. */
export function matchedNamesSql(pattern: string, columns: ReadonlyArray<{ table: string; column: string }>, schema = 'public'): string {
  const parts = columns.map((c) => `select m[1] from ${ident(schema)}.${ident(c.table)}, regexp_matches(${ident(c.column)}::text, ${lit(pattern)}, 'g') as m`)
  return `select distinct * from (${parts.join(' union all ')}) x`
}

/** The names (final path segments, un-encoded) that some table mentions. Throws on any database problem: an
 *  unanswered question is never treated as "no mention". */
export async function findMentions(dbUrl: string, names: readonly string[], exec: Exec = realExec, baseEnv: Readonly<Record<string, string | undefined>> = process.env): Promise<Set<string>> {
  const found = new Set<string>()
  const psql = async (sql: string): Promise<string[]> => {
    try {
      const { stdout } = await exec('psql', [dbUrl, '-X', '-At', '-c', sql], { ...baseEnv, PGOPTIONS: READ_ONLY_PGOPTIONS })
      return stdout.split('\n').map((l) => l.trim()).filter(Boolean)
    } catch (e) {
      const stderr = e instanceof Error && 'stderr' in e ? String((e as { stderr: unknown }).stderr) : ''
      throw new Error(`database read failed: ${stderr.replace(/postgres(ql)?:\/\/\S+/g, '<db-url>').split('\n')[0] || 'see psql'}`) // never print the connection string
    }
  }
  for (const group of chunk([...new Set(names)], 250)) {
    const pattern = mentionPattern(group)
    const columns = (await psql(columnsWithHitsSql(pattern))).map((l) => {
      const i = l.indexOf('|')
      return { table: l.slice(0, i), column: l.slice(i + 1) }
    })
    if (columns.length === 0) continue
    for (const m of await psql(matchedNamesSql(pattern, columns))) {
      // a percent-encoded hit maps back to the plain name it came from
      const plain = group.find((n) => n === m || encodeURIComponent(n) === m)
      if (plain) found.add(plain)
    }
  }
  return found
}
