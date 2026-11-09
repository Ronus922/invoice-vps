import { CLASS_LABEL, SKIP_LABEL, savingPct, summarize, type ClassSummary, type SkipReason } from './decision'
import type { FileReport } from './run'

// Text for the person running the script: the per-class summary, the five biggest wins, the five files that were
// skipped or failed and why. Pure functions of the reports, so the numbers in a message are tested numbers.

export function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`
  if (n >= 1024) return `${Math.round(n / 1024)}KB`
  return `${n}B`
}

const pct = (before: number, after: number): string => `${savingPct(before, after).toFixed(1)}%`

/** Markdown table: סוג | כמות | נפח לפני | נפח אחרי | חיסכון | יוחלפו | ידולגו (+ a total row). */
export function renderSummary(rows: readonly ClassSummary[]): string {
  const total = rows.reduce(
    (t, s) => ({ count: t.count + s.count, before: t.before + s.before, after: t.after + s.after, replaced: t.replaced + s.replaced, skipped: t.skipped + s.skipped }),
    { count: 0, before: 0, after: 0, replaced: 0, skipped: 0 },
  )
  const line = (label: string, s: { count: number; before: number; after: number; replaced: number; skipped: number }) =>
    `| ${label} | ${s.count} | ${fmtBytes(s.before)} | ${fmtBytes(s.after)} | ${fmtBytes(s.before - s.after)} (${pct(s.before, s.after)}) | ${s.replaced} | ${s.skipped} |`
  return [
    '| סוג | כמות | נפח לפני | נפח אחרי | חיסכון | יוחלפו | ידולגו |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...rows.map((s) => line(CLASS_LABEL[s.contentClass], s)),
    line('**סה"כ**', total),
  ].join('\n')
}

/** Why files were skipped, per class — "which rule cost how many files". */
export function renderSkipReasons(rows: readonly ClassSummary[]): string {
  const lines: string[] = []
  for (const s of rows) {
    const parts = Object.entries(s.skippedBy)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, n]) => `${SKIP_LABEL[reason as SkipReason]}: ${n}`)
    if (parts.length) lines.push(`- ${CLASS_LABEL[s.contentClass]} — ${parts.join(' · ')}`)
  }
  return lines.join('\n')
}

export const summaryOf = (reports: readonly FileReport[]): ClassSummary[] =>
  summarize(reports.map((r) => ({ contentClass: r.contentClass, beforeBytes: r.beforeBytes, decision: r.decision })))

/** The files with the biggest saving among those that would be replaced. */
export function topSavings(reports: readonly FileReport[], n: number): FileReport[] {
  return reports
    .filter((r) => r.decision.action === 'replace')
    .sort((a, b) => (b.decision.action === 'replace' ? b.decision.savingBytes : 0) - (a.decision.action === 'replace' ? a.decision.savingBytes : 0))
    .slice(0, n)
}

/** Failures first (an integrity or engine failure is something to LOOK at), then the biggest files that were skipped
 *  for a reason a person might want to reconsider — never the ones skipped by a standing rule (signed, scan source). */
const FAILURE_RANK: Partial<Record<SkipReason, number>> = { 'integrity-failed': 0, 'engine-failed': 1, 'download-failed': 2, 'object-missing': 3, 'below-threshold': 4, 'not-smaller': 5 }
export function notReplaced(reports: readonly FileReport[], n: number): FileReport[] {
  const rank = (r: FileReport) => (r.decision.action === 'skip' ? (FAILURE_RANK[r.decision.reason] ?? 9) : 99)
  return reports
    .filter((r) => r.decision.action === 'skip' && rank(r) < 9)
    .sort((a, b) => rank(a) - rank(b) || b.beforeBytes - a.beforeBytes)
    .slice(0, n)
}

export function describe(r: FileReport): string {
  const d = r.decision
  const verdict = d.action === 'replace' ? `להחליף (${d.savingPct.toFixed(1)}%)` : `לדלג: ${SKIP_LABEL[d.reason]}`
  const after = r.engineBytes === null ? '-' : fmtBytes(r.engineBytes)
  return `${r.ids[0]?.slice(0, 8) ?? '?'}  ${CLASS_LABEL[r.contentClass].padEnd(28)} ${fmtBytes(r.beforeBytes).padStart(8)} → ${after.padStart(8)}  ${verdict}${r.note ? `  [${r.note}]` : ''}`
}

/** One TSV line per file: id, type, before, after, saving %, decision, reason, note. */
export function toTsv(reports: readonly FileReport[]): string {
  const head = ['id', 'type', 'before_bytes', 'after_bytes', 'saving_pct', 'decision', 'reason', 'note'].join('\t')
  const rows = reports.map((r) => {
    const after = r.engineBytes
    return [
      r.ids.join(','),
      r.contentClass,
      r.beforeBytes,
      after ?? '',
      after === null ? '' : savingPct(r.beforeBytes, after).toFixed(1),
      r.decision.action === 'replace' ? 'replace' : 'skip',
      r.decision.action === 'skip' ? r.decision.reason : '',
      r.note.replace(/[\t\n]/g, ' '),
    ].join('\t')
  })
  return [head, ...rows].join('\n')
}
