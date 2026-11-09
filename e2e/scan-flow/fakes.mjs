// Local fakes for the scan-flow harness: Supabase (auth, PostgREST, Storage) and Anthropic. Nothing here
// leaves the machine: the built app is pointed at these two loopback servers, so no production service,
// credential, mailbox or accountant is involved — and "send to accountant" cannot send (no Gmail, no setting).
import http from 'node:http'

export const USER = { id: '11111111-2222-3333-4444-555555555555', aud: 'authenticated', role: 'authenticated', email: 'r@bios.co.il' }

const readBody = (req) => new Promise((resolve) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => resolve(Buffer.concat(c))) })
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }

/** The session cookie the app reads (the cookie name is derived from the Supabase URL's first host label). */
export function sessionCookie(host) {
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 3600
  const jwt = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: USER.id, email: USER.email, exp, aud: 'authenticated', role: 'authenticated' })}.sig`
  const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: USER }
  return { name: `sb-${host.split('.')[0]}-auth-token`, value: encodeURIComponent(JSON.stringify(session)) }
}

export async function startFakes({ supabasePort, anthropicPort }) {
  const rows = [] // the invoices table
  const objects = new Map() // storage: path -> Buffer
  const log = []
  const aiCalls = []
  let receiptNumber = 4454 // each photo read gets the next number, so a batch never collides with itself
  let pdfNumber = 9000

  const supabase = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x')
    // The page's own Supabase client (browser) talks to this server cross-origin, as it does to the real one.
    res.setHeader('access-control-allow-origin', req.headers.origin ?? '*')
    res.setHeader('access-control-allow-headers', req.headers['access-control-request-headers'] ?? '*')
    res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS')
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
    const body = await readBody(req)
    if (u.pathname === '/auth/v1/user') return json(res, 200, { ...USER, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' })
    if (u.pathname === '/rest/v1/invoices') {
      if (req.method === 'GET') {
        let out = rows
        for (const [k, v] of u.searchParams) if (v.startsWith('eq.')) out = out.filter((r) => String(r[k]) === v.slice(3))
        const sel = u.searchParams.get('select')
        const cols = sel && sel !== '*' ? sel.split(',').map((c) => c.trim()) : null
        return json(res, 200, out.map((r) => (cols ? Object.fromEntries(cols.map((c) => [c, r[c] ?? null])) : r)))
      }
      if (req.method === 'POST') {
        const row = JSON.parse(body.toString())
        const dup = rows.find((r) => r.vendor === row.vendor && r.doc_number === row.doc_number && r.doc_type === row.doc_type && (row.doc_number ?? '') !== '')
        if (dup) { log.push('INSERT invoices -> 23505'); return json(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint "invoices_vendor_docnum_doctype_new_uniq"', details: null, hint: null }) }
        const saved = { id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row }
        rows.push(saved); log.push(`INSERT invoices ${saved.source} -> ${saved.id}`)
        return json(res, 201, saved)
      }
      if (req.method === 'PATCH') return json(res, 200, [])
    }
    const m = u.pathname.match(/^\/storage\/v1\/object\/(?:authenticated\/|public\/)?invoice-files(?:\/(.*))?$/)
    if (m) {
      const path = decodeURIComponent(m[1] ?? '')
      if (req.method === 'POST') { objects.set(path, body); log.push(`STORAGE put ${path} ${body.length}B`); return json(res, 200, { Id: 'x', Key: `invoice-files/${path}` }) }
      if (req.method === 'DELETE') { const { prefixes } = JSON.parse(body.toString()); for (const p of prefixes) objects.delete(p); return json(res, 200, prefixes.map((name) => ({ name }))) }
      const o = objects.get(path)
      if (!o) return json(res, 404, { error: 'not_found', message: 'Object not found' })
      res.writeHead(200, { 'content-type': path.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg' }); return res.end(o)
    }
    // The PDF road signs a URL for the object, then fetches it (src/lib/storage.ts).
    const sign = u.pathname.match(/^\/storage\/v1\/object\/sign\/invoice-files\/(.*)$/)
    if (sign) {
      const path = decodeURIComponent(sign[1])
      if (req.method === 'POST') return json(res, 200, { signedURL: `/object/sign/invoice-files/${sign[1]}?token=t` })
      const o = objects.get(path)
      if (!o) return json(res, 404, { error: 'not_found' })
      res.writeHead(200, { 'content-type': path.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg' }); return res.end(o)
    }
    // Any other table (settings, gmail_tokens, categories…): empty, so the page renders and nothing can be sent.
    if (u.pathname.startsWith('/rest/v1/')) return json(res, req.method === 'POST' ? 201 : 200, [])
    log.push(`UNHANDLED ${req.method} ${req.url}`)
    json(res, 404, { message: 'unhandled' })
  })

  const anthropic = http.createServer(async (req, res) => {
    const body = JSON.parse((await readBody(req)).toString())
    const blocks = body.messages[0].content
    const img = blocks.find((b) => b.type === 'image')
    const pdf = blocks.find((b) => b.type === 'document')
    aiCalls.push({ kind: img ? 'image' : pdf ? 'pdf' : 'other', model: body.model, tool: body.tool_choice?.name })
    const input = pdf
      ? { date: '05/11/2026', vendor: 'ספק PDF בע"מ', doc_number: String(++pdfNumber), doc_type: 'חשבונית מס', currency: '₪', pretax: 200, vat: 36, total: 236, payment_method: 'העברה', description: 'שירות', category: 'אחר' }
      : { date: '09/11/2026', vendor: 'שופרסל דיל בע"מ', doc_number: String(++receiptNumber), doc_type: 'קבלה', currency: '₪', pretax: null, vat: null, total: 118, payment_method: 'אשראי', description: 'מצרכים', category: 'אחר', vendor_tax_id: '51-2345678', confidence: { vendor: 0.97, doc_number: 0.55, total: 0.99, date: 0.9 } }
    json(res, 200, { id: 'msg_1', type: 'message', role: 'assistant', model: body.model, stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'tool_use', id: 'toolu_1', name: 'return_invoice', input }] })
  })

  await Promise.all([
    new Promise((r) => supabase.listen(supabasePort, '127.0.0.1', r)),
    new Promise((r) => anthropic.listen(anthropicPort, '127.0.0.1', r)),
  ])
  const reset = () => { rows.length = 0; objects.clear(); aiCalls.length = 0; log.length = 0; receiptNumber = 4454; pdfNumber = 9000 }
  return { rows, objects, log, aiCalls, reset, close: () => { supabase.close(); anthropic.close() } }
}
