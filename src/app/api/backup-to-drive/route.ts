import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { getGmailAccessToken } from '@/lib/gmail'
import { resolveFileUrl } from '@/lib/storage'
import { ensureFolder, findFileInFolder, uploadFile, moveFile, monthFolderName } from '@/lib/drive'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ROOT_FOLDER_NAME = 'חשבוניות InvoiceFlow'

let activeRun: Promise<unknown> | null = null

interface InvoiceRow {
  id: string
  vendor: string | null
  doc_number: string | null
  file_url: string | null
  file_name: string | null
  created_at: string
  backed_up_to_drive_at: string | null
  drive_file_id: string | null
}

interface ProgressSnapshot {
  phase: 'init' | 'uploading' | 'done'
  total: number
  processed: number
  uploaded: number
  skipped: number
  errors: number
}

function deriveYearMonth(row: InvoiceRow): { year: number; month: number } {
  const date = new Date(row.created_at)
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}

function buildFilename(row: InvoiceRow): string {
  if (row.file_name && row.file_name.trim()) return row.file_name
  const vendor = (row.vendor || 'unknown').replace(/[\\/:"*?<>|]/g, '_')
  const doc = (row.doc_number || row.id).toString().replace(/[\\/:"*?<>|]/g, '_')
  return `${vendor}_${doc}.pdf`
}

function mimeFromFilename(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'application/octet-stream'
}

async function authorize(request: NextRequest): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const user = await getAuthenticatedUser()
  if (user) return { ok: true }

  const secret = request.headers.get('x-cron-secret')
  if (secret && process.env.CRON_SECRET && secret === process.env.CRON_SECRET) {
    return { ok: true }
  }

  return {
    ok: false,
    res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  }
}

async function getRootFolderId(accessToken: string): Promise<string> {
  const { data } = await supabase
    .from('gmail_tokens')
    .select('drive_root_folder_id')
    .eq('id', 'default')
    .single()

  if (data?.drive_root_folder_id) {
    return data.drive_root_folder_id
  }

  const id = await ensureFolder(accessToken, ROOT_FOLDER_NAME, 'root')
  await supabase
    .from('gmail_tokens')
    .update({ drive_root_folder_id: id })
    .eq('id', 'default')
  return id
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request)
  if (!auth.ok) return auth.res

  const { data: state } = await supabase
    .from('gmail_tokens')
    .select('last_drive_backup_at, last_drive_backup_error, drive_backup_enabled, drive_root_folder_id, refresh_token')
    .eq('id', 'default')
    .single()

  const { count: totalBackedUp } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .not('backed_up_to_drive_at', 'is', null)

  const { count: pendingCount } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .is('backed_up_to_drive_at', null)

  return NextResponse.json({
    lastBackupAt: state?.last_drive_backup_at ?? null,
    lastError: state?.last_drive_backup_error ?? null,
    enabled: state?.drive_backup_enabled ?? true,
    connected: Boolean(state?.refresh_token),
    running: activeRun !== null,
    totalBackedUp: totalBackedUp ?? 0,
    pendingCount: pendingCount ?? 0,
    driveRootFolderId: state?.drive_root_folder_id ?? null,
  })
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request)
  if (!auth.ok) return auth.res

  const body = await request.json().catch(() => ({}))
  const force = Boolean(body.force)

  if (activeRun) {
    return NextResponse.json({ status: 'already_running' }, { status: 202 })
  }

  const runBackup = async (onProgress?: (snap: ProgressSnapshot) => void) => {
    const progress: ProgressSnapshot = {
      phase: 'init',
      total: 0,
      processed: 0,
      uploaded: 0,
      skipped: 0,
      errors: 0,
    }
    const report = () => onProgress?.({ ...progress })

    const accessToken = await getGmailAccessToken()
    const rootId = await getRootFolderId(accessToken)

    const folderCache = new Map<string, string>()

    const ensureYearMonthFolder = async (year: number, month: number): Promise<string> => {
      const key = `${year}-${month}`
      const cached = folderCache.get(key)
      if (cached) return cached
      const yearKey = `${year}`
      let yearId = folderCache.get(yearKey)
      if (!yearId) {
        yearId = await ensureFolder(accessToken, String(year), rootId)
        folderCache.set(yearKey, yearId)
      }
      const monthId = await ensureFolder(accessToken, monthFolderName(month), yearId)
      folderCache.set(key, monthId)
      return monthId
    }

    let lastError: string | null = null

    // Pass 1 — reorganize already-backed-up files into their created_at folder
    const { data: backedRows, error: backedError } = await supabase
      .from('invoices')
      .select('id,vendor,doc_number,file_url,file_name,created_at,backed_up_to_drive_at,drive_file_id')
      .not('drive_file_id', 'is', null)
      .order('created_at', { ascending: true })

    if (backedError) throw new Error(`DB select failed: ${backedError.message}`)

    for (const row of (backedRows as InvoiceRow[] | null) ?? []) {
      if (!row.drive_file_id) continue
      try {
        const { year, month } = deriveYearMonth(row)
        const folderId = await ensureYearMonthFolder(year, month)
        const result = await moveFile(accessToken, row.drive_file_id, folderId)
        if (result === 'missing') {
          await supabase
            .from('invoices')
            .update({
              backed_up_to_drive_at: null,
              drive_file_id: null,
              drive_backup_error: 'file missing in Drive, will re-upload',
            })
            .eq('id', row.id)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown'
        lastError = message
        await supabase
          .from('invoices')
          .update({ drive_backup_error: `reorg: ${message}`.slice(0, 500) })
          .eq('id', row.id)
      }
    }

    // Pass 2 — upload pending invoices (backed_up_to_drive_at IS NULL)
    const query = supabase
      .from('invoices')
      .select('id,vendor,doc_number,file_url,file_name,created_at,backed_up_to_drive_at,drive_file_id')
      .not('file_url', 'is', null)
      .order('created_at', { ascending: true })

    if (!force) {
      query.is('backed_up_to_drive_at', null)
    }

    const { data: rows, error: selectError } = await query
    if (selectError) throw new Error(`DB select failed: ${selectError.message}`)

    const invoices: InvoiceRow[] = (rows as InvoiceRow[] | null) ?? []
    progress.total = invoices.length
    progress.phase = 'uploading'
    report()

    for (const row of invoices) {
      progress.processed += 1
      try {
        if (!row.file_url) {
          progress.skipped += 1
          report()
          continue
        }

        const { year, month } = deriveYearMonth(row)
        const folderId = await ensureYearMonthFolder(year, month)
        const filename = buildFilename(row)

        const existingId = await findFileInFolder(accessToken, folderId, filename)
        if (existingId) {
          await supabase
            .from('invoices')
            .update({
              backed_up_to_drive_at: new Date().toISOString(),
              drive_file_id: existingId,
              drive_backup_error: null,
            })
            .eq('id', row.id)
          progress.skipped += 1
          report()
          continue
        }

        const fetchUrl = await resolveFileUrl(row.file_url, 120)
        if (!fetchUrl) {
          throw new Error('no signed url for file')
        }
        const fileRes = await fetch(fetchUrl, { signal: AbortSignal.timeout(60000) })
        if (!fileRes.ok) {
          throw new Error(`fetch file_url ${fileRes.status}`)
        }
        const buffer = Buffer.from(await fileRes.arrayBuffer())
        const mime = mimeFromFilename(filename)
        const uploaded = await uploadFile(accessToken, folderId, filename, mime, buffer)

        await supabase
          .from('invoices')
          .update({
            backed_up_to_drive_at: new Date().toISOString(),
            drive_file_id: uploaded.id,
            drive_backup_error: null,
          })
          .eq('id', row.id)

        progress.uploaded += 1
        report()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown'
        lastError = message
        await supabase
          .from('invoices')
          .update({ drive_backup_error: message.slice(0, 500) })
          .eq('id', row.id)
        progress.errors += 1
        report()
      }
    }

    progress.phase = 'done'
    report()

    await supabase
      .from('gmail_tokens')
      .update({
        last_drive_backup_at: new Date().toISOString(),
        last_drive_backup_error: progress.errors > 0 ? lastError : null,
      })
      .eq('id', 'default')

    return {
      status: 'ok' as const,
      total: progress.total,
      uploaded: progress.uploaded,
      skipped: progress.skipped,
      errors: progress.errors,
      lastBackupAt: new Date().toISOString(),
    }
  }

  activeRun = runBackup()
    .catch(async (err) => {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[backup-to-drive] error:', err)
      await supabase
        .from('gmail_tokens')
        .update({ last_drive_backup_error: message.slice(0, 500) })
        .eq('id', 'default')
    })
    .finally(() => {
      activeRun = null
    })

  return NextResponse.json({ status: 'started' }, { status: 202 })
}
