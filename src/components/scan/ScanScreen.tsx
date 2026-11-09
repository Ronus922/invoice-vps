'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Camera, Check, Download, FileText, ImageIcon, Info, Loader2, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import UploadZone from '@/components/invoices/UploadZone'
import { deriveVatFromTotal } from '@/lib/vat-derivation'
import { formatCurrency } from '@/lib/format'
import { applyRememberedCategory, rememberVendorCategory } from '@/lib/vendor-category-memory'
import { lowConfidenceFields, parseAmount, toSavePayload, vatStillDerived } from '@/lib/scan/format'
import {
  DOC_TYPE_LABELS, EMPTY_SCAN_VALUES, type DuplicateInfo, type OcrResponse, type ScanPassthrough, type ScanValues,
} from '@/lib/scan/model'
import { CropEditor } from './CropEditor'
import { ReceiptForm } from './ReceiptForm'

// "סרוק קבלה": photo → CROP (Ronen fits a frame around the receipt, in the browser) → OCR (the server
// normalises the CROPPED photo and Claude reads it) → a form pre-filled from the receipt, every field
// editable → "שמור". The uncropped photo never leaves the phone. The cropped photo reaches Storage only
// on the last click, and a document that already exists is shown BEFORE that click, never dropped silently.
// A saved receipt that needs no review goes to the accountant through the SAME /api/send-to-accountant
// call the upload zone uses.

type Phase = 'idle' | 'crop' | 'reading' | 'ready' | 'unreadable' | 'saved'

interface SavedState {
  id: string
  vendor: string
  docNumber: string
  total: number
  currency: string
  needsReview: boolean
  reviewReason: string | null
  sent: boolean | null // null = not attempted (needs review)
  sendNote: string
}

function blobFromBase64(b64: string, type: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

// Why /api/send-to-accountant did not send (its `reason` / `error` strings), in words Ronen can act on.
function sendFailureText(note: string): string {
  if (note === 'no_accountant_email') return 'לא הוגדר מייל רואה חשבון בהגדרות'
  if (note === 'gmail_not_connected') return 'חשבון ה-Gmail לא מחובר'
  if (note === 'network') return 'אין חיבור'
  return 'שגיאת שליחה'
}

const card = 'rounded-2xl border p-4'
const cardStyle = { background: 'var(--panel)', borderColor: 'var(--border)' } as const

export default function ScanScreen() {
  const queryClient = useQueryClient()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [problem, setProblem] = useState('')
  const [notice, setNotice] = useState('')

  const [ocrOk, setOcrOk] = useState(true)
  const [ocrFields, setOcrFields] = useState<ScanValues>(EMPTY_SCAN_VALUES)
  const [vatDerivedByOcr, setVatDerivedByOcr] = useState(false)
  const [readAmounts, setReadAmounts] = useState<{ pretax: number | null; vat: number | null }>({ pretax: null, vat: null })
  const [passthrough, setPassthrough] = useState<ScanPassthrough>({ description: '', category: '' })
  const [imageB64, setImageB64] = useState('')
  const [imageType, setImageType] = useState('image/jpeg')
  const [imageBytes, setImageBytes] = useState(0)
  const [values, setValues] = useState<ScanValues>(EMPTY_SCAN_VALUES)
  const [lowSet, setLowSet] = useState<ReadonlySet<keyof ScanValues>>(new Set())

  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState<SavedState | null>(null)

  // One object URL per photo; the previous one is freed when the next arrives or the screen closes.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const reset = useCallback(() => {
    setPhase('idle')
    setFile(null)
    setPreviewUrl(null)
    setProblem('')
    setNotice('')
    setDuplicate(null)
    setSaveError('')
    setSaved(null)
    setValues(EMPTY_SCAN_VALUES)
    setImageB64('')
  }, [])

  function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (!picked) return
    reset()
    setFile(picked)
    setPreviewUrl(URL.createObjectURL(picked))
    setPhase('crop')
  }

  // Step 2 — normalise + read the CROPPED photo.
  const readPhoto = useCallback(async (photo: Blob, name: string, signal?: AbortSignal) => {
    setPhase('reading')
    try {
      const fd = new FormData()
      fd.append('image', photo, name)
      const r = await fetch('/api/scan/ocr', { method: 'POST', body: fd, credentials: 'include', signal })
      const data = (await r.json().catch(() => ({}))) as Partial<OcrResponse> & { error?: string }
      if (!r.ok || !data.fields || !data.image_base64) {
        setProblem(r.status === 401 ? 'נדרשת התחברות מחדש — רענן את העמוד' : (data.error ?? 'לא ניתן לפתוח את התמונה — צלם שוב'))
        setPhase('unreadable')
        return
      }
      const withCategory = applyRememberedCategory({ vendor: data.fields.vendor, category: data.passthrough?.category ?? '' })
      const pass: ScanPassthrough = { description: data.passthrough?.description ?? '', category: withCategory.category ?? '' }
      setImageB64(data.image_base64)
      setImageType(data.image_type ?? 'image/jpeg')
      setImageBytes(data.image_bytes ?? 0)
      setOcrOk(data.ok === true)
      setOcrFields(data.fields)
      setVatDerivedByOcr(data.vat_derived === true)
      setReadAmounts(data.read_amounts ?? { pretax: null, vat: null })
      setPassthrough(pass)
      setValues(data.fields)
      setLowSet(lowConfidenceFields(data.fields, data.confidence ?? {}))
      setPhase('ready')
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setProblem('החיבור נכשל — בדוק את הקליטה ונסה שוב')
      setPhase('unreadable')
    }
  }, [])

  function onCropped(blob: Blob) {
    void readPhoto(blob, 'receipt.jpg')
  }

  // The browser cannot draw this file (a HEIC outside Safari): no crop is possible here, so the photo goes
  // to the server as it is — the server decodes HEIC itself.
  function onCropUnavailable() {
    if (!file) return
    setNotice('הדפדפן לא יכול להציג את התמונה לחיתוך — היא נשלחת כמות שהיא.')
    void readPhoto(file, file.name || 'receipt')
  }

  function retake() {
    reset()
    cameraRef.current?.click()
  }

  // The early warning: does this document already exist? Asked while Ronen edits; POST /api/scan/save asks again.
  useEffect(() => {
    if (phase !== 'ready') return
    const ctl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ vendor: values.vendor, doc_number: values.doc_number, doc_type: values.doc_type })
        const r = await fetch(`/api/scan/duplicate?${q}`, { credentials: 'include', signal: ctl.signal })
        if (!r.ok) return
        const data = (await r.json()) as { duplicate?: boolean; existing?: DuplicateInfo | null }
        setDuplicate(data.duplicate ? (data.existing ?? null) : null)
      } catch {
        /* the save step checks again */
      }
    }, 400)
    return () => {
      clearTimeout(timer)
      ctl.abort()
    }
  }, [phase, values.vendor, values.doc_number, values.doc_type])

  function patch(p: Partial<ScanValues>) {
    setValues((v) => ({ ...v, ...p }))
    setLowSet((s) => {
      const next = new Set(s)
      for (const k of Object.keys(p) as (keyof ScanValues)[]) next.delete(k) // an edited field is no longer a guess
      return next
    })
    setSaveError('')
  }

  async function save() {
    if (saving || phase !== 'ready') return
    setSaving(true)
    setSaveError('')
    try {
      const fd = new FormData()
      fd.append('image', blobFromBase64(imageB64, imageType), 'receipt.jpg')
      fd.append('data', JSON.stringify(toSavePayload(values, passthrough, { ok: ocrOk, fields: ocrFields, vatDerived: vatDerivedByOcr, readAmounts })))
      const r = await fetch('/api/scan/save', { method: 'POST', body: fd, credentials: 'include' })
      const data = (await r.json().catch(() => ({}))) as {
        error?: string
        duplicate?: boolean
        existing?: DuplicateInfo | null
        invoice?: Record<string, unknown>
      }
      if (r.status === 409 && data.duplicate) {
        setDuplicate(data.existing ?? null)
        setSaveError('המסמך כבר קיים במערכת — לא נשמר. תקן את הפרטים או בטל.')
        return
      }
      if (!r.ok || !data.invoice) throw new Error(data.error ?? 'שמירת הקבלה נכשלה')

      const inv = data.invoice
      const needsReview = Boolean(inv.needs_review)
      if (values.vendor && passthrough.category) rememberVendorCategory(values.vendor, passthrough.category)
      let sent: boolean | null = null
      let sendNote = ''
      if (!needsReview) {
        // Same call, same contract as UploadZone: 200 + sent:true = delivered; check `sent`, not res.ok.
        try {
          const sendRes = await fetch('/api/send-to-accountant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              invoice_id: inv.id,
              file_url: inv.file_url,
              vendor: String(inv.vendor ?? ''),
              date: String(inv.date ?? ''),
            }),
          })
          const sendData = (await sendRes.json().catch(() => null)) as { sent?: boolean; reason?: string; error?: string } | null
          sent = sendRes.ok && sendData?.sent === true
          if (!sent) sendNote = sendData?.reason || sendData?.error || String(sendRes.status)
        } catch {
          sent = false
          sendNote = 'network'
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['invoices'] })
      setSaved({
        id: String(inv.id),
        vendor: String(inv.vendor ?? ''),
        docNumber: String(inv.doc_number ?? ''),
        total: Number(inv.total ?? 0),
        currency: String(inv.currency ?? 'ILS'),
        needsReview,
        reviewReason: (inv.validation_error as string | null) ?? null,
        sent,
        sendNote,
      })
      setPhase('saved')
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // What the server will do with the amounts, shown before saving (same functions as the server).
  const total = parseAmount(values.total)
  const vatHint = (() => {
    if (total === null || total === 0) return null
    // Still the OCR's own derivation → the server derives again from the final total / date / currency.
    if (vatStillDerived(values, { vatDerived: vatDerivedByOcr, fields: ocrFields })) return 'המע״מ ייחשב אוטומטית מהסכום הסופי (לא נקרא מהקבלה).'
    return deriveVatFromTotal({
      pretax: parseAmount(values.pretax), vat: parseAmount(values.vat), total, currency: values.currency,
      date: values.date ? values.date.split('-').reverse().join('/') : null,
    }).vatDerived
      ? 'המע״מ ייחשב אוטומטית מהסכום הסופי (חסר או לא מתאים לסכומים שהוזנו).'
      : null
  })()
  const incomplete = values.vendor.trim() === '' || values.doc_number.trim() === '' || total === null || total === 0

  return (
    <div dir="rtl" className="flex min-h-[100dvh] flex-col" style={{ background: 'var(--bg-grad)', color: 'var(--text)' }}>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPicked} data-testid="scan-camera-input" />
      <input ref={galleryRef} type="file" accept="image/*" className="sr-only" onChange={onPicked} data-testid="scan-gallery-input" />

      <header className="flex items-center gap-3 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link
          href="/"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text2)' }}
          aria-label="חזרה לחשבוניות"
        >
          <ArrowRight className="h-5 w-5" aria-hidden />
        </Link>
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-extrabold">סרוק קבלה</h1>
          <p className="m-0 text-[13px]" style={{ color: 'var(--text3)' }}>
            {phase === 'crop' ? 'סמן את הקבלה בלבד ולחץ „המשך”.'
              : phase === 'reading' ? 'קורא את הקבלה…'
              : phase === 'ready' ? 'בדוק את הפרטים, תקן ושמור.'
              : phase === 'saved' ? 'הקבלה נשמרה.'
              : 'צלם קבלה נייר — המערכת תקרא את הנתונים ותכניס אותה לחשבוניות.'}
          </p>
        </div>
      </header>

      {phase === 'idle' && (
        <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-10 pt-3">
          <section className={`${card} flex flex-col gap-3`} style={cardStyle}>
            <Button type="button" onClick={() => cameraRef.current?.click()} className="h-14 w-full gap-3 px-4 py-2 text-base font-bold" data-testid="scan-camera-button">
              <Camera aria-hidden />
              צלם קבלה
            </Button>
            <Button type="button" variant="outline" onClick={() => galleryRef.current?.click()} className="h-12 w-full gap-3 px-4 py-2 text-base" data-testid="scan-gallery-button">
              <ImageIcon aria-hidden />
              בחר תמונה מהגלריה
            </Button>
            <p className="m-0 text-[13px]" style={{ color: 'var(--muted-mid)' }}>
              צלם מלמעלה, על רקע כהה ובתאורה טובה. באייפון ייתכן שייפתח גם בורר תמונות — זה תקין.
              קבלה ארוכה מסופר? תמונה אחת מספיקה, ובשלב הבא אפשר לחתוך גבוה וצר.
            </p>
          </section>

          <section className={card} style={cardStyle}>
            <div className="mb-3 flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text2)' }}>
              <FileText className="h-4 w-4" aria-hidden />
              יש לך קובץ PDF?
            </div>
            <p className="mb-3 mt-0 text-[13px]" style={{ color: 'var(--muted-mid)' }}>
              PDF נכנס לאותו צינור כמו כל חשבונית שמועלית — בלי חיתוך.
            </p>
            <UploadZone onInvoiceExtracted={() => void queryClient.invalidateQueries({ queryKey: ['invoices'] })} />
          </section>
        </main>
      )}

      {phase === 'crop' && previewUrl && (
        <CropEditor
          src={previewUrl} confirmLabel="המשך" cancelLabel="צלם שוב"
          onConfirm={onCropped} onCancel={retake} onLoadError={onCropUnavailable}
        />
      )}

      {phase === 'reading' && (
        <main className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-6">
          <div role="status" aria-live="polite" className={`${card} flex flex-col items-center gap-3 p-8 text-center`} style={cardStyle}>
            <Loader2 className="h-9 w-9 animate-spin" style={{ color: 'var(--accent)' }} aria-hidden />
            <div className="text-lg font-bold">קורא את הקבלה…</div>
            <div className="text-sm" style={{ color: 'var(--muted-mid)' }}>זה לוקח כמה שניות. אפשר לא לסגור את המסך.</div>
          </div>
        </main>
      )}

      {phase === 'unreadable' && (
        <main className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-6">
          <div role="alert" className="flex flex-col items-center gap-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
            <AlertTriangle className="h-9 w-9 text-red-300" aria-hidden />
            <div className="text-lg font-bold">{problem}</div>
            <Button type="button" onClick={retake} className="h-11 gap-2 px-4 py-2">
              <ScanLine aria-hidden />
              צלם שוב
            </Button>
          </div>
        </main>
      )}

      {phase === 'ready' && (
        <>
          <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-28 pt-3">
            {notice && <p className="m-0 text-[13px]" style={{ color: 'var(--muted-mid)' }}>{notice}</p>}
            {ocrOk ? (
              <div className="flex items-start gap-3 rounded-xl border border-blue-400/30 bg-blue-500/10 p-4 text-sm">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  הפרטים נקראו מהקבלה. בדוק מול הצילום ותקן לפני שמירה{lowSet.size > 0 ? ' — שדות מסומנים בצהוב נקראו בביטחון נמוך' : ''}.
                </span>
              </div>
            ) : (
              <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>לא הצלחנו לקרוא את הקבלה אוטומטית — מלא את הפרטים ידנית מהצילום.</span>
              </div>
            )}

            {duplicate && (
              <div role="alert" data-testid="scan-duplicate" className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" aria-hidden />
                <div className="min-w-0">
                  <p className="m-0 font-bold">המסמך הזה כבר קיים במערכת — לא יישמר שוב.</p>
                  <p className="m-0 mt-1" style={{ color: 'var(--text2)' }}>
                    {duplicate.vendor} · מס׳ {duplicate.doc_number} · {DOC_TYPE_LABELS[duplicate.doc_type] ?? duplicate.doc_type}
                    {duplicate.date ? ` · ${duplicate.date}` : ''}
                    {duplicate.total !== null ? ` · ${formatCurrency(duplicate.total, duplicate.currency)}` : ''}
                  </p>
                  <p className="m-0 mt-1 text-[13px]" style={{ color: 'var(--muted-mid)' }}>
                    אם זו קבלה אחרת, תקן את הספק, המספר או סוג המסמך. אם זה אותו מסמך — לחץ „בטל”.
                  </p>
                </div>
              </div>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element -- a one-off data: URL of the cropped photo; next/image cannot optimise it */}
            <img
              src={`data:${imageType};base64,${imageB64}`} alt="צילום הקבלה"
              className="mx-auto max-h-72 w-full rounded-xl border bg-white object-contain p-0"
              style={{ borderColor: 'var(--border)' }}
            />
            <p className="m-0 text-center text-[12px]" style={{ color: 'var(--muted-mid)' }}>
              {Math.round(imageBytes / 1024)}KB · נשמר כ-JPEG רגיל, בלי מיקום ובלי נתוני מכשיר
            </p>

            <section className={card} style={cardStyle}>
              <ReceiptForm values={values} onChange={patch} lowConfidence={lowSet} disabled={saving} />
              {vatHint && <p className="m-0 mt-3 text-[13px]" style={{ color: 'var(--muted-mid)' }}>{vatHint}</p>}
            </section>

            {incomplete && (
              <p className="m-0 text-[13px] text-amber-300">
                חסר ספק, מספר מסמך או סכום: הקבלה תישמר לבדיקה ולא תישלח לרואה החשבון עד שתשלים אותם.
              </p>
            )}
            {saveError && <p role="alert" className="m-0 text-sm font-semibold text-red-300">{saveError}</p>}
          </main>

          <footer
            className="fixed inset-x-0 bottom-0 z-10 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}
          >
            <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={reset} disabled={saving} className="h-11 px-4 py-2" data-testid="scan-cancel">
                בטל
              </Button>
              <Button type="button" onClick={() => void save()} disabled={saving || duplicate !== null} className="h-11 flex-1 gap-2 px-4 py-2 text-base font-bold" data-testid="scan-save">
                {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                {saving ? 'שומר…' : 'אשר ושמור'}
              </Button>
            </div>
          </footer>
        </>
      )}

      {phase === 'saved' && saved && (
        <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-10 pt-3">
          <section className={`${card} flex flex-col gap-3`} style={cardStyle} data-testid="scan-saved">
            <div className="flex items-center gap-2 text-lg font-bold">
              <Check className="h-5 w-5" style={{ color: 'var(--accent)' }} aria-hidden />
              הקבלה נשמרה
            </div>
            <p className="m-0 text-sm" style={{ color: 'var(--text2)' }}>
              {saved.vendor || 'ללא שם ספק'} · מס׳ {saved.docNumber || '—'} · {formatCurrency(saved.total, saved.currency)}
            </p>
            {saved.needsReview ? (
              <p className="m-0 text-sm text-amber-300">
                סומנה לבדיקה{saved.reviewReason ? `: ${saved.reviewReason}` : ''} — לא נשלחה לרואה החשבון. אפשר לתקן אותה בטבלת החשבוניות.
              </p>
            ) : saved.sent ? (
              <p className="m-0 text-sm" style={{ color: 'var(--accent)' }}>נשלחה לרואה החשבון.</p>
            ) : (
              <p className="m-0 text-sm text-amber-300">
                נשמרה, אבל לא נשלחה לרואה החשבון — {sendFailureText(saved.sendNote)}. היא תופיע בטבלה ובבאנר „חשבוניות לא נשלחו” ותישלח משם.
              </p>
            )}
            <a
              href={`/api/scan/${saved.id}/image?download=1`}
              download
              className="flex h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium"
              style={{ borderColor: 'var(--border)', background: 'var(--input-bg)', color: 'var(--text2)' }}
            >
              <Download className="h-4 w-4" aria-hidden />
              הורד
            </a>
            <Button type="button" onClick={() => { reset(); cameraRef.current?.click() }} className="h-12 w-full gap-2 px-4 py-2 text-base font-bold">
              <Camera aria-hidden />
              סרוק קבלה נוספת
            </Button>
            <Link href="/" className="flex h-11 items-center justify-center text-sm" style={{ color: 'var(--link)' }}>
              חזרה לחשבוניות
            </Link>
          </section>
        </main>
      )}
    </div>
  )
}
