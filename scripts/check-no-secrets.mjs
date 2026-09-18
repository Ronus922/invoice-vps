#!/usr/bin/env node
// INVARIANT: no secret is committed to git — not at HEAD, and not anywhere in
// the history. The repo is PUBLIC: a key pushed in one commit and deleted in
// the next is still readable by anyone who clones it, forever.
//   (1) No .env file other than *.example is tracked at HEAD.
//   (2) None of the actual secret VALUES from .env.local appear in any tracked
//       file, or anywhere in the history. This catches a real leak regardless
//       of pattern — but only where the values themselves are available.
//   (3) No obvious key patterns (Anthropic prefix, service_role JWT, private
//       key header) in tracked code at HEAD.
//   (4) HISTORY, across every ref: no .env file ever existed, and no
//       key-shaped string was ever introduced — including one later deleted.
//
// Part (2) needs .env.local, or the same vars injected into the environment.
// Where they are absent it prints SKIPPED — never ✓. A green tick on a
// comparison that never happened is worse than no check at all: it is a
// standing claim that the values were searched for and not found.
//
// Part (4) needs the COMPLETE history. In CI that is actions/checkout with
// fetch-depth: 0, set on the `checks` job. A shallow clone FAILS here rather
// than passing quietly — unlike (2), the fix costs nothing and is already
// configured, so a shallow clone is a misconfiguration, not a constraint.
//
// Never prints a secret value — only the offending KEY name, file and commit.
import { run, repoRoot, loadEnv, fail, ok, info } from './_lib.mjs'
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SENSITIVE_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY', 'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN', 'CRON_SECRET', 'DATABASE_URL', 'DIRECT_URL',
]

// HEAD scan: fixed strings. Cheap, and a placeholder in today's code is a
// mistake worth removing anyway.
const HEAD_PATTERNS = [
  ['sk-ant-', 'מפתח Anthropic'],
  ['"role":"service_role"', 'JWT service_role'],
  ['-----BEGIN', 'מפתח פרטי'],
]

// HISTORY scan: the same three shapes, tightened to demand real key material
// (POSIX ERE, via git log --pickaxe-regex). History cannot be corrected
// without a rewrite, so a documentation placeholder — sk-ant-... in a deleted
// README — must not turn this into a permanently red check that everyone
// learns to ignore. Only a string that could actually BE a key fails here.
const HISTORY_PATTERNS = [
  ['sk-ant-[A-Za-z0-9_-]{24,}', 'מפתח Anthropic'],
  ['"role":"service_role"', 'JWT service_role'],
  ['-----BEGIN [A-Z ]*PRIVATE KEY-----', 'מפתח פרטי'],
]

// What counts as "code" — kept identical for the HEAD and history pattern
// scans, so the two can never disagree about what they are looking at.
const CODE_PATHS = ['.', ':(exclude)scripts/check-*', ':(exclude)*.example']
// Real values are never legitimate, not even in a check script.
const VALUE_PATHS = ['.', ':(exclude)*.example']

const isEnvFile = (f) => /(^|\/)\.env/.test(f) && !f.endsWith('.example')

// A git failure must never read as "nothing found" — that is precisely the
// silent false pass this check exists to prevent. Only the one documented
// no-match exit code is tolerated; anything else throws and fails the check.
function gitOut(root, args, noMatchStatus = null) {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (err) {
    if (noMatchStatus !== null && err.status === noMatchStatus) return ''
    const detail = String(err.stderr || err.message).trim().slice(0, 300)
    throw new Error(`git ${args[0]} נכשל (קוד ${err.status}): ${detail}`)
  }
}

// git grep for a fixed string at HEAD; matching files, empty if none.
// -e so needles beginning with '-' (e.g. "-----BEGIN") aren't parsed as flags.
function grepFixed(root, needle) {
  return gitOut(root, ['grep', '-l', '-F', '-e', needle], 1)
    .split('\n').filter(Boolean)
}

// Commits on ANY ref where the number of occurrences of <needle> changed —
// i.e. where it was introduced, or removed again. This is what catches a key
// that was pushed and deleted in the next commit.
function pickaxe(root, needle, { regex = false, paths = VALUE_PATHS } = {}) {
  const args = ['log', '--all', '--oneline', '--max-count=5']
  if (regex) args.push('--pickaxe-regex')
  args.push(`-S${needle}`, '--', ...paths)
  return gitOut(root, args).split('\n').filter(Boolean)
}

// Anything not run is recorded, printed loudly, and — in CI — surfaced in the
// job summary. It is never allowed to look like a pass.
const SKIPS = []
function skip(title, lines) {
  console.log(`  ⏭ ${title} — לא רץ`)
  for (const line of lines) console.log(`      ${line}`)
  SKIPS.push({ title, lines })
}

run('check-no-secrets', async () => {
  const root = repoRoot()
  loadEnv()
  const envLocal = join(root, '.env.local')

  // --- (1) tracked env files at HEAD ---------------------------------------
  const envFiles = gitOut(root, ['ls-files']).split('\n').filter(Boolean).filter(isEnvFile)
  if (envFiles.length === 0) ok('אין קבצי .env במעקב git (מלבד *.example)')
  else fail('קבצי env במעקב git: ' + envFiles.join(', '))

  // --- (2) literal secret values, at HEAD and in history -------------------
  // The condition for this part to mean anything is a usable VALUE, not the
  // presence of a file: CI may inject the vars instead of shipping .env.local.
  const withValue = SENSITIVE_KEYS.filter((k) => (process.env[k] || '').length >= 12)
  const withoutValue = SENSITIVE_KEYS.filter((k) => !withValue.includes(k))

  if (withValue.length === 0) {
    skip('חלק (2): השוואה מול ערכי הסוד האמיתיים', [
      existsSync(envLocal)
        ? '.env.local קיים, אך אין בו אף ערך שמיש (12 תווים ומעלה).'
        : '.env.local לא קיים ואף משתנה סוד לא הוזרק לסביבה — ריצת CI או clone נקי.',
      `לא נבדק: האם אחד מ-${SENSITIVE_KEYS.length} הערכים האמיתיים מופיע בקובץ במעקב או בהיסטוריה.`,
      'חלקים (1), (3) ו-(4) כן רצו — הם תופסים צורת מפתח, לא את הערך עצמו.',
      'הבדיקה הזו אמיתית רק היכן שהערכים קיימים: על ה-VPS, npm run check:secrets.',
      'הערכים לא יוזרקו כ-Actions secrets: הריפו ציבורי, והזרמת סוד לתוך CI כדי לוודא שלא דלף מחליפה סיכון בסיכון גדול יותר.',
    ])
  } else {
    let leaked = 0
    for (const key of withValue) {
      const val = process.env[key]
      const hits = grepFixed(root, val).filter((f) => !f.endsWith('.example'))
      if (hits.length) {
        fail(`הערך של ${key} מופיע בקבצים במעקב: ${hits.join(', ')}`)
        leaked++
      }
      const commits = pickaxe(root, val)
      if (commits.length) {
        fail(`הערך של ${key} הופיע בהיסטוריה (${commits.length} קומיטים): ${commits.join(' | ')}`)
        leaked++
      }
    }
    if (leaked === 0) {
      ok(`אף אחד מ-${withValue.length} ערכי הסוד לא מופיע בקבצים במעקב ולא בהיסטוריה`)
    }
    if (withoutValue.length) {
      skip(`חלק (2): ${withoutValue.length} מפתחות ללא ערך זמין`, [
        'לא הושוו: ' + withoutValue.join(', '),
        `${withValue.length} המפתחות הנותרים כן הושוו — ראו מעל.`,
      ])
    }
  }

  // --- (3) generic key shapes at HEAD --------------------------------------
  let patternHit = 0
  for (const [needle, label] of HEAD_PATTERNS) {
    const hits = grepFixed(root, needle)
      .filter((f) => !f.endsWith('.example') && !f.startsWith('scripts/check-'))
    if (hits.length) { fail(`${label} בקבצים: ${hits.join(', ')}`); patternHit++ }
  }
  if (patternHit === 0) ok('אין תבניות מפתח חשודות בקוד המנוהל')

  // --- (4) the history itself ----------------------------------------------
  if (gitOut(root, ['rev-parse', '--is-shallow-repository']) === 'true') {
    fail('clone רדוד — אי אפשר לסרוק היסטוריה. ב-CI: actions/checkout עם fetch-depth: 0. מקומית: git fetch --unshallow')
  } else {
    // Every path that ever existed in any tree reachable from any ref —
    // exhaustive where --diff-filter=A is not: it also covers files that
    // arrived through a merge or a rename.
    const everPaths = new Set(
      gitOut(root, ['rev-list', '--objects', '--all']).split('\n')
        .map((line) => {
          const i = line.indexOf(' ')      // "<sha> <path>"; commits have no path
          return i === -1 ? '' : line.slice(i + 1).trim()
        })
        .filter(Boolean)
    )
    const everEnv = [...everPaths].filter(isEnvFile).sort()
    if (everEnv.length === 0) {
      ok(`אף קובץ .env לא נוסף אי-פעם בהיסטוריה (${everPaths.size} נתיבים, כל ה-refs)`)
    } else {
      for (const f of everEnv) {
        const where = gitOut(root, ['log', '--all', '--oneline', '--max-count=3', '--', f])
          .split('\n').filter(Boolean)
        fail(`הקובץ ${f} קיים בהיסטוריה: ${where.join(' | ')}`)
      }
      fail('היסטוריה ציבורית — הסוד חשוף גם אם הקובץ נמחק מאז. החליפו את המפתחות; rewrite להיסטוריה הוא החלטה של רונן בלבד.')
    }

    let historyHit = 0
    for (const [needle, label] of HISTORY_PATTERNS) {
      const commits = pickaxe(root, needle, { regex: true, paths: CODE_PATHS })
      if (commits.length) {
        fail(`${label} — מחרוזת בצורת מפתח הופיעה בהיסטוריה: ${commits.join(' | ')}`)
        historyHit++
      }
    }
    if (historyHit === 0) ok('אין מחרוזת בצורת מפתח אמיתי בהיסטוריה (כל ה-refs)')
  }

  if (existsSync(envLocal)) info('.env.local קיים מקומית ולא במעקב — כך צריך')

  if (SKIPS.length) {
    console.log('')
    const many = SKIPS.length > 1
    console.log(`  ⏭ ${many ? SKIPS.length + ' חלקים לא רצו' : 'חלק אחד לא רץ'}. דילוג אינו מעבר — מה שלא נבדק לעיל אינו מאושר.`)
    const stepSummary = process.env.GITHUB_STEP_SUMMARY
    if (stepSummary) {
      const md = ['### ⏭️ check:secrets — חלקים שלא רצו (זה **לא** מעבר)', '']
      for (const s of SKIPS) {
        md.push(`**${s.title}**`, '')
        for (const line of s.lines) md.push(`- ${line}`)
        md.push('')
      }
      appendFileSync(stepSummary, md.join('\n') + '\n')
    }
  }
})
