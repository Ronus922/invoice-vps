// The scan flow on the HOME PAGE, driven in a real browser against the BUILT app and local fakes
// (Supabase + Anthropic, see fakes.mjs) — touch gestures included. Run it by hand; it is not part of CI
// (it needs a build with the fake Supabase URL baked in):
//
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3491 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-fake \
//   SUPABASE_SERVICE_ROLE_KEY=svc-fake pnpm build
//   pnpm test:scan-flow            # SCAN_FLOW_SHOTS=<dir> also saves a screenshot per step
//
// Profiles: Pixel 7 (Chrome on Android) and iPhone 14 — both with REAL touch events (CDP
// Input.dispatchTouchEvent → pointerType "touch"), and a desktop mouse. The iPhone profile is Chromium
// emulating the device (UA, viewport, touch): WebKit is not installed here, so real Safari is NOT covered.
//
// What it proves: the zone on "/" is the only entry point; PDFs keep their road, photos open the overlay;
// dragging a handle / the frame / pinching works by finger; crop → read → review → save writes a row with
// source = 'scan'; a batch is scanned one photo after the other; and nothing navigates (no /login) on the way.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from '@playwright/test'
import { sessionCookie, startFakes } from './fakes.mjs'
import { receiptPhoto, tinyPdf } from './receipts.mjs'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SB = Number(process.env.SCAN_FLOW_SB_PORT ?? 3491) // must equal the NEXT_PUBLIC_SUPABASE_URL the app was built with
const AI = Number(process.env.SCAN_FLOW_AI_PORT ?? 3492)
const WEB = Number(process.env.SCAN_FLOW_WEB_PORT ?? 3490)
const BASE = `http://127.0.0.1:${WEB}`
const SHOTS = process.env.SCAN_FLOW_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

if (!existsSync(join(ROOT, '.next/standalone/server.js'))) {
  console.error('No standalone build. Build first with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:' + SB + ' (see the header of this file).')
  process.exit(2)
}

const results = []
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`) }
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 120)) } return false }

const fakes = await startFakes({ supabasePort: SB, anthropicPort: AI })
const app = spawn(process.execPath, ['server.js'], {
  cwd: join(ROOT, '.next/standalone'),
  env: {
    PATH: process.env.PATH, PORT: String(WEB), HOSTNAME: '127.0.0.1', NODE_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SB}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-fake', SUPABASE_SERVICE_ROLE_KEY: 'svc-fake',
    ANTHROPIC_API_KEY: 'fake-key-for-local-harness', ANTHROPIC_BASE_URL: `http://127.0.0.1:${AI}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let appLog = ''
app.stdout.on('data', (d) => (appLog += d)); app.stderr.on('data', (d) => (appLog += d))

const frame = (page) => page.evaluate(() => { const r = document.querySelector('[data-crop-rect]'); return r ? { x: +r.dataset.x, y: +r.dataset.y, w: +r.dataset.w, h: +r.dataset.h } : null })
const zoom = async (page) => Number(await page.locator('[data-crop-stage]').getAttribute('data-crop-zoom'))
const mid = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })

// A finger (or the mouse) from `from` to `to`.
async function drag(page, cdp, touch, from, to, steps = 8) {
  if (!touch) {
    await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps }); await page.mouse.up()
    return
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] })
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, id: 1 }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

// Two fingers apart (or the wheel, on a desktop).
async function spread(page, cdp, touch, c, from, to, steps = 8) {
  if (!touch) { await page.mouse.move(c.x, c.y); await page.mouse.wheel(0, -400); return }
  const pts = (d) => [{ x: c.x - d / 2, y: c.y, id: 1 }, { x: c.x + d / 2, y: c.y, id: 2 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from) })
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(from + (to - from) * (i / steps)) })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

const PROFILES = [
  { name: 'Pixel 7', device: devices['Pixel 7'], touch: true },
  { name: 'iPhone 14', device: devices['iPhone 14'], touch: true },
  { name: 'Desktop', device: devices['Desktop Chrome'], touch: false },
]

async function runProfile(browser, P, photos) {
  const n = (s) => `[${P.name}] ${s}`
  const device = { ...P.device }
  delete device.defaultBrowserType
  const ctx = await browser.newContext({ ...device, locale: 'he-IL' })
  await ctx.addCookies([{ ...sessionCookie('127.0.0.1'), domain: '127.0.0.1', path: '/' }])
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  const cdp = await ctx.newCDPSession(page)
  const navs = []
  const errors = []
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(new URL(f.url()).pathname) })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|\[upload\] accountant send not sent/.test(m.text())) errors.push('console: ' + m.text()) })
  page.on('response', (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`) })
  const shot = (name) => (SHOTS ? page.screenshot({ path: join(SHOTS, `${P.name.replace(/\W+/g, '-')}-${name}.png`) }) : null)
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)

  // The user's own gesture: tap the zone → (on a phone) the source sheet → the chooser.
  async function pick(which, files) {
    const zone = page.getByText(/לחץ לצילום או בחירת קובץ|גרור קבצי PDF או תמונות לכאן/)
    const chooser = page.waitForEvent('filechooser')
    await zone.click()
    if (P.touch) await page.getByText(which === 'camera' ? 'צלם חשבונית' : 'גלריה וקבצים').click()
    const fc = await chooser
    await fc.setFiles(files)
    return fc
  }
  const asFile = (name, mimeType, buffer) => ({ name, mimeType, buffer })

  // ---- the home page, authenticated, with no second entry point -------------------------------------
  await page.goto(BASE + '/')
  await page.waitForSelector('#invoice-upload-input', { state: 'attached' })
  check(n('"/" opens with the session — no redirect to /login'), new URL(page.url()).pathname === '/')
  check(n('no "סרוק קבלה" button or menu item anywhere on the page'), (await page.getByText('סרוק קבלה').count()) === 0)
  const gone = await ctx.request.get(BASE + '/scan', { maxRedirects: 0 })
  check(n('/scan is gone (404 even with a session)'), gone.status() === 404, String(gone.status()))
  const attrs = await page.locator('#invoice-upload-input').evaluate((e) => ({ accept: e.accept, multiple: e.multiple }))
  const cam = await page.locator('input[type=file][capture]').evaluate((e) => ({ accept: e.accept, capture: e.getAttribute('capture') }))
  check(n('upload input accepts "application/pdf,image/*", multiple'), attrs.accept === 'application/pdf,image/*' && attrs.multiple === true, JSON.stringify(attrs))
  check(n('the camera input is image/* + capture=environment'), cam.accept === 'image/*' && cam.capture === 'environment', JSON.stringify(cam))
  await shot('1-home')

  // ---- a photo from the camera button → the overlay on the SAME page ---------------------------------
  const fc1 = await pick('camera', asFile('IMG_0001.jpg', 'image/jpeg', photos.wide))
  check(n('camera chooser is single-file'), P.touch ? fc1.isMultiple() === false : true)
  await page.waitForSelector('[data-crop-rect]')
  await page.waitForTimeout(250)
  const overlay = await page.locator('[data-testid=scan-overlay]').boundingBox()
  const vp = page.viewportSize()
  check(n('the crop opens in an overlay that covers the page; still on "/"'), !!overlay && overlay.width >= vp.width - 1 && overlay.height >= vp.height - 1 && new URL(page.url()).pathname === '/', JSON.stringify(overlay))
  check(n('background page cannot scroll under the overlay'), (await page.evaluate(() => document.body.style.overflow)) === 'hidden')
  check(n('no horizontal scroll with the crop open'), await noHScroll())
  await shot('2-crop')

  const f0 = await frame(page)
  const handles = await page.$$eval('[data-crop-handle]', (els) => els.filter((e) => e.dataset.cropHandle !== 'move').map((e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height } }))
  check(n('8 handles, each a ≥44px touch target'), handles.length === 8 && handles.every((h) => h.w >= 44 && h.h >= 44))
  const buttons = await page.$$eval('[data-crop-cancel], [data-crop-confirm]', (els) => els.map((e) => e.getBoundingClientRect().height))
  check(n('"צלם שוב" and "המשך" are ≥44px high'), buttons.length === 2 && buttons.every((h) => h >= 44))

  // ---- the gestures ---------------------------------------------------------------------------------
  const se = mid(await page.locator('[data-crop-handle=se]').boundingBox())
  await drag(page, cdp, P.touch, se, { x: se.x - 50, y: se.y - 70 })
  const f1 = await frame(page)
  check(n('dragging the SE corner resizes the frame (free-form)'), f1.w < f0.w && f1.h < f0.h && Math.abs(f1.w / f1.h - f0.w / f0.h) > 0.001, `${f0.w}x${f0.h} → ${f1.w}x${f1.h}`)
  const nw = mid(await page.locator('[data-crop-handle=nw]').boundingBox())
  await drag(page, cdp, P.touch, nw, { x: nw.x + 30, y: nw.y + 30 })
  const f2 = await frame(page)
  check(n('dragging the NW corner resizes it from the other side'), f2.w < f1.w && f2.h < f1.h && f2.x > f1.x && f2.y > f1.y, `${f1.w}x${f1.h} → ${f2.w}x${f2.h}`)
  const inside = mid(await page.locator('[data-crop-rect]').boundingBox())
  await drag(page, cdp, P.touch, inside, { x: inside.x + 25, y: inside.y + 25 })
  const f3 = await frame(page)
  check(n('dragging inside the frame moves it, same size'), f3.x > f2.x && f3.y > f2.y && f3.w === f2.w && f3.h === f2.h, `${f2.x},${f2.y} → ${f3.x},${f3.y}`)
  const stage = mid(await page.locator('[data-crop-stage]').boundingBox())
  const z0 = await zoom(page)
  await spread(page, cdp, P.touch, stage, 60, 200)
  const z1 = await zoom(page)
  check(n(P.touch ? 'pinching two fingers zooms the picture' : 'the wheel zooms the picture'), z1 > z0 * 1.2, `${z0} → ${z1}`)
  check(n('the pinch did not change the frame'), JSON.stringify(await frame(page)) === JSON.stringify(f3))
  check(n('the browser itself did not zoom the page'), (await page.evaluate(() => window.visualViewport?.scale ?? 1)) === 1)
  await shot('3-after-gestures')

  // ---- crop → read → review → save, on the same page -------------------------------------------------
  await page.locator('[data-crop-confirm]').click()
  await page.waitForSelector('[data-testid=scan-save]')
  const val = (id) => page.locator(`#scan-${id}`).inputValue()
  check(n('form pre-filled from the OCR'), (await val('vendor')) === 'שופרסל דיל בע"מ' && (await val('doc_number')) === '4455' && (await val('total')) === '118.00' && (await val('date')) === '2026-11-09')
  const low = await page.$$eval('[data-low-confidence=true]', (els) => els.map((e) => e.dataset.field))
  check(n('only the low-confidence field (doc_number) is yellow'), JSON.stringify(low) === '["doc_number"]', JSON.stringify(low))
  check(n('form controls ≥44px, no horizontal scroll'), (await page.$$eval('#scan-vendor, #scan-total, #scan-doc_type', (els) => els.every((e) => e.getBoundingClientRect().height >= 44))) && await noHScroll())
  await shot('4-form')
  await page.locator('[data-testid=scan-save]').click()
  await page.waitForSelector('[data-testid=scan-saved]')
  const scanned = fakes.rows.filter((r) => r.source === 'scan')
  check(n('saved: one row with source="scan", created by the session user'), scanned.length === 1 && scanned[0].created_by === '11111111-2222-3333-4444-555555555555')
  const href = await page.locator('a[download]').getAttribute('href')
  const dl = await ctx.request.get(BASE + href)
  check(n('download link streams the photo with an RFC 5987 name'), dl.status() === 200 && /filename\*=UTF-8''/.test(dl.headers()['content-disposition'] ?? ''), href)
  await shot('5-saved')
  await page.locator('[data-testid=scan-next]').click()
  check(n('"סיום" closes the overlay; the page is still "/"'), (await page.locator('[data-testid=scan-overlay]').count()) === 0 && new URL(page.url()).pathname === '/')
  check(n('the saved receipt shows in the table on the page behind (badge "סריקה")'), await until(async () => (await page.getByText('סריקה', { exact: true }).count()) > 0, 8000))

  // ---- "צלם שוב" swaps the photo; the X abandons -----------------------------------------------------
  await pick('gallery', asFile('IMG_0002.jpg', 'image/jpeg', photos.wide))
  await page.waitForSelector('[data-crop-rect]')
  const w1 = await page.locator('[data-crop-stage] img').evaluate((i) => i.naturalWidth)
  const retake = page.waitForEvent('filechooser')
  await page.locator('[data-crop-cancel]').click()
  await (await retake).setFiles(asFile('IMG_0003.jpg', 'image/jpeg', photos.tall))
  await page.waitForFunction((w) => { const i = document.querySelector('[data-crop-stage] img'); return i && i.naturalWidth !== w }, w1)
  const ft = await frame(page)
  check(n('"צלם שוב" opens the camera and replaces the photo (new picture, new frame)'), !!ft && ft.h / ft.w > 2, JSON.stringify(ft))
  await page.locator('[data-testid=scan-close]').click()
  check(n('the X abandons the scan — nothing saved'), (await page.locator('[data-testid=scan-overlay]').count()) === 0 && fakes.rows.filter((r) => r.source === 'scan').length === 1)

  // ---- a mixed selection: PDF → the old road, photos → the overlay one after the other ---------------
  await pick('gallery', [asFile('a.jpg', 'image/jpeg', photos.wide), asFile('invoice.pdf', 'application/pdf', tinyPdf()), asFile('b.jpg', 'image/jpeg', photos.tall)])
  await page.waitForSelector('[data-crop-rect]')
  check(n('2 photos + 1 PDF → the overlay says "תמונה 1 מתוך 2"'), (await page.locator('[data-testid=scan-position]').innerText()).includes('1 מתוך 2'))
  check(n('the PDF went down the existing road (row source="manual", never cropped)'), await until(() => fakes.rows.some((r) => r.source === 'manual' && r.vendor === 'ספק PDF בע"מ')), JSON.stringify(fakes.aiCalls.map((c) => c.kind)))
  await page.locator('[data-crop-confirm]').click()
  await page.waitForSelector('[data-testid=scan-save]')
  await page.locator('[data-testid=scan-save]').click()
  await page.waitForSelector('[data-testid=scan-saved]')
  check(n('after the first save the button says "לתמונה הבאה"'), (await page.locator('[data-testid=scan-next]').innerText()).includes('לתמונה הבאה'))
  await page.locator('[data-testid=scan-next]').click()
  await page.waitForSelector('[data-crop-rect]')
  check(n('the second photo is cropped next: "תמונה 2 מתוך 2", a tall frame'), (await page.locator('[data-testid=scan-position]').innerText()).includes('2 מתוך 2') && (await frame(page)).h / (await frame(page)).w > 2)
  await page.locator('[data-crop-confirm]').click()
  await page.waitForSelector('[data-testid=scan-save]')
  await page.locator('[data-testid=scan-save]').click()
  await page.waitForSelector('[data-testid=scan-saved]')
  check(n('the last one says "סיום"'), (await page.locator('[data-testid=scan-next]').innerText()).includes('סיום'))
  await page.locator('[data-testid=scan-next]').click()
  check(n('batch done: 3 scan rows in all, overlay closed'), fakes.rows.filter((r) => r.source === 'scan').length === 3 && (await page.locator('[data-testid=scan-overlay]').count()) === 0)

  // ---- the same receipt twice is shown BEFORE saving -------------------------------------------------
  fakes.rows.length = 0 // a fresh table with ONE existing document — the form is then edited to that same identity
  fakes.rows.push({ id: crypto.randomUUID(), source: 'gmail', vendor: 'שופרסל דיל בע"מ', doc_number: '4460', doc_type: 'receipt', date: '09/11/2026', total: 118, currency: 'ILS' })
  await pick('gallery', asFile('dup.jpg', 'image/jpeg', photos.wide))
  await page.waitForSelector('[data-crop-rect]')
  await page.locator('[data-crop-confirm]').click()
  await page.waitForSelector('[data-testid=scan-save]')
  const dupNo = await val('doc_number')
  if (dupNo !== '4460') await page.locator('#scan-doc_number').fill('4460')
  await page.waitForSelector('[data-testid=scan-duplicate]')
  check(n('an existing document is shown before saving and Save is disabled'), await page.locator('[data-testid=scan-save]').isDisabled())
  await page.locator('[data-testid=scan-cancel]').click()
  check(n('"בטל" leaves without saving'), (await page.locator('[data-testid=scan-overlay]').count()) === 0)

  check(n('the whole run never navigated away from "/" and never touched /login'), navs.every((p) => p === '/'), navs.join(','))
  check(n('no page errors / 5xx on the way'), errors.length === 0, errors.slice(0, 3).join(' || '))
  await ctx.close()
}

let code = 0
try {
  for (let i = 0; i < 60; i++) { try { await fetch(`${BASE}/login`); break } catch { await new Promise((r) => setTimeout(r, 250)) } }
  const photos = { wide: await receiptPhoto('wide'), tall: await receiptPhoto('tall') }
  const browser = await chromium.launch()
  for (const P of PROFILES) {
    fakes.reset()
    try { await runProfile(browser, P, photos) } catch (e) { check(`[${P.name}] the run completed`, false, String(e).split('\n')[0]) }
  }
  await browser.close()
} finally {
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (fakes.log.some((l) => l.startsWith('UNHANDLED'))) console.log('fake Supabase, unhandled:\n' + [...new Set(fakes.log.filter((l) => l.startsWith('UNHANDLED')))].slice(0, 8).join('\n'))
  if (failed.length) console.log('app log (errors):\n' + appLog.split('\n').filter((l) => /rror/.test(l)).slice(0, 8).join('\n'))
  app.kill('SIGTERM'); fakes.close()
  code = failed.length ? 1 : 0
}
process.exit(code)
