const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

export const HEB_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

export function monthFolderName(month: number): string {
  return `${String(month).padStart(2, '0')} - ${HEB_MONTHS[month - 1]}`
}

function escapeForQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function driveFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
    signal: init.signal ?? AbortSignal.timeout(30000),
  })
}

export async function ensureFolder(
  accessToken: string,
  name: string,
  parentId: string
): Promise<string> {
  const q = [
    `name='${escapeForQuery(name)}'`,
    `mimeType='application/vnd.google-apps.folder'`,
    `'${parentId}' in parents`,
    `trashed=false`,
  ].join(' and ')

  const searchRes = await driveFetch(
    accessToken,
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`
  )
  if (!searchRes.ok) {
    throw new Error(`Drive folder search failed: ${await searchRes.text()}`)
  }
  const searchData = await searchRes.json()
  if (searchData.files?.[0]?.id) return searchData.files[0].id as string

  const createRes = await driveFetch(accessToken, `/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  })
  if (!createRes.ok) {
    throw new Error(`Drive folder create failed: ${await createRes.text()}`)
  }
  const created = await createRes.json()
  return created.id as string
}

export async function findFileInFolder(
  accessToken: string,
  folderId: string,
  name: string
): Promise<string | null> {
  const q = [
    `name='${escapeForQuery(name)}'`,
    `'${folderId}' in parents`,
    `trashed=false`,
  ].join(' and ')

  const res = await driveFetch(
    accessToken,
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`
  )
  if (!res.ok) return null
  const data = await res.json()
  return data.files?.[0]?.id ?? null
}

export interface UploadedFile {
  id: string
  webViewLink?: string
}

export async function moveFile(
  accessToken: string,
  fileId: string,
  newParentId: string
): Promise<'moved' | 'in_place' | 'missing'> {
  const getRes = await driveFetch(accessToken, `/files/${fileId}?fields=parents`)
  if (getRes.status === 404) return 'missing'
  if (!getRes.ok) throw new Error(`Drive get parents failed: ${await getRes.text()}`)
  const data = await getRes.json()
  const parents: string[] = data.parents ?? []
  if (parents.includes(newParentId)) return 'in_place'

  const qs = new URLSearchParams({
    addParents: newParentId,
    removeParents: parents.join(','),
    fields: 'id,parents',
  })
  const patchRes = await driveFetch(accessToken, `/files/${fileId}?${qs}`, {
    method: 'PATCH',
  })
  if (!patchRes.ok) throw new Error(`Drive move failed: ${await patchRes.text()}`)
  return 'moved'
}

export async function uploadFile(
  accessToken: string,
  folderId: string,
  filename: string,
  mimeType: string,
  buffer: Buffer
): Promise<UploadedFile> {
  const boundary = `boundary_${Math.random().toString(36).slice(2)}`
  const metadata = { name: filename, parents: [folderId] }

  const head = `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
  const tail = `\r\n--${boundary}--`

  const body = Buffer.concat([
    Buffer.from(head, 'utf8'),
    buffer,
    Buffer.from(tail, 'utf8'),
  ])

  const res = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body,
      signal: AbortSignal.timeout(120000),
    }
  )

  if (!res.ok) {
    throw new Error(`Drive upload failed: ${await res.text()}`)
  }
  const data = await res.json()
  return { id: data.id, webViewLink: data.webViewLink }
}
