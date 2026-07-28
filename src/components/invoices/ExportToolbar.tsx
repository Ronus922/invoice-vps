'use client'

import { useState } from 'react'
import { Download, Printer, Loader2, FileSpreadsheet } from 'lucide-react'
import type { Invoice } from '@/lib/entities'
import { fileHref } from '@/lib/file-url'
import { currencySymbol } from '@/lib/format'

interface ExportToolbarProps {
  filteredInvoices: Invoice[]
}

// Invoice fields originate from AI extraction over emailed documents — treat
// them as untrusted in every non-JSX sink.
const escapeHtml = (v: unknown) =>
  String(v).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  )

// Excel/Sheets execute cells starting with = + - @ (formula injection). Text
// fields only — numeric cells must stay raw so negative credit notes parse.
const csvSafe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v)

export default function ExportToolbar({ filteredInvoices = [] }: ExportToolbarProps) {
  const [isZipping, setIsZipping] = useState(false)

  const filesCount = filteredInvoices.filter((i) => i.file_url).length

  const handlePrint = () => {
    if (filteredInvoices.length === 0) return

    const rows = filteredInvoices
      .map(
        (inv) => `
      <tr>
        <td>${escapeHtml(inv.date || '—')}</td>
        <td>${escapeHtml(inv.vendor || '—')}</td>
        <td>${escapeHtml(inv.doc_number || '—')}</td>
        <td>${escapeHtml(inv.description || '—')}</td>
        <td>${escapeHtml(currencySymbol(inv.currency))}${(inv.total || 0).toLocaleString('he-IL')}</td>
        <td>${escapeHtml(inv.payment_method || '—')}</td>
        <td>${escapeHtml(inv.category || '—')}</td>
      </tr>`
      )
      .join('')

    const totalsByCurrency = new Map<string, number>()
    for (const inv of filteredInvoices) {
      const code = (inv.currency || 'ILS').toUpperCase()
      totalsByCurrency.set(code, (totalsByCurrency.get(code) ?? 0) + (inv.total || 0))
    }
    const totalsLabel = [...totalsByCurrency.entries()]
      .map(([code, sum]) => `${currencySymbol(code)}${sum.toLocaleString('he-IL')}`)
      .join(' + ')

    const html = `
      <!DOCTYPE html><html dir="rtl"><head>
      <meta charset="utf-8">
      <title>חשבוניות</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; direction: rtl; }
        h2 { text-align: center; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: right; }
        th { background: #f0f0f0; font-weight: bold; }
        tfoot td { font-weight: bold; background: #f9f9f9; }
      </style>
      </head><body>
      <h2>רשימת חשבוניות (${filteredInvoices.length})</h2>
      <table>
        <thead><tr><th>תאריך</th><th>ספק</th><th>מס'</th><th>תיאור</th><th>סה"כ</th><th>תשלום</th><th>קטגוריה</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4">סה"כ (${filteredInvoices.length} חשבוניות)</td><td>${totalsLabel}</td><td colspan="2"></td></tr></tfoot>
      </table>
      </body></html>`

    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
      win.print()
    }
  }

  const handleCsv = () => {
    if (filteredInvoices.length === 0) return

    const headers = [
      'תאריך',
      'ספק',
      "מס' חשבונית",
      'תיאור',
      'מטבע',
      'לפני מע"מ',
      'מע"מ',
      'סה"כ',
      'תשלום',
      'קטגוריה',
    ]
    const rows = filteredInvoices.map((inv) => [
      csvSafe(inv.date || ''),
      csvSafe(inv.vendor || ''),
      csvSafe(inv.doc_number || ''),
      csvSafe(inv.description || ''),
      csvSafe(inv.currency || 'ILS'),
      inv.pretax ?? '',
      inv.vat ?? '',
      inv.total ?? '',
      csvSafe(inv.payment_method || ''),
      csvSafe(inv.category || ''),
    ])
    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `חשבוניות_${new Date().toLocaleDateString('he-IL').replace(/\//g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleZip = async () => {
    if (filesCount === 0) {
      alert('אין קבצים להורדה בסינון הנוכחי')
      return
    }

    setIsZipping(true)
    try {
      const fileUrls = filteredInvoices
        .filter((inv) => inv.file_url)
        .map((inv) => ({
          url: fileHref(inv.file_url!),
          // Include doc_type in the fallback so an Invoice and a Receipt sharing a
          // number don't collide as identical zip entries when file_name is absent.
          name:
            inv.file_name ||
            `${inv.vendor}_${inv.doc_number}${inv.doc_type && inv.doc_type !== 'unknown' ? `_${inv.doc_type}` : ''}.pdf`,
        }))

      const JSZip = (await import('jszip')).default
      const zip = new JSZip()

      await Promise.all(
        fileUrls.map(async ({ url, name }) => {
          const res = await fetch(url)
          if (res.ok) {
            const blob = await res.blob()
            zip.file(name, blob)
          }
        })
      )

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(zipBlob)
      a.download = `חשבוניות_${new Date().toLocaleDateString('he-IL').replace(/\//g, '-')}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setIsZipping(false)
    }
  }

  return (
    <>
      <button
        onClick={handleCsv}
        disabled={filteredInvoices.length === 0}
        className="flex h-10 items-center gap-1.5 rounded-[10px] px-3.5 text-[13.5px] font-semibold transition-opacity disabled:opacity-40"
        style={{
          background: 'var(--accent-soft)',
          border: '1px solid rgba(45, 212, 191, 0.4)',
          color: 'var(--accent)',
        }}
      >
        <FileSpreadsheet className="h-4 w-4" />
        יצוא לאקסל
      </button>
      <button
        onClick={handleZip}
        disabled={isZipping || filesCount === 0}
        className="flex h-10 items-center gap-1.5 rounded-[10px] px-3.5 text-[13.5px] font-medium transition-opacity disabled:opacity-40"
        style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text2)' }}
      >
        {isZipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {isZipping ? 'מכין ZIP...' : 'הורד ZIP'}
      </button>
      <button
        onClick={handlePrint}
        disabled={filteredInvoices.length === 0}
        className="flex h-10 items-center gap-1.5 rounded-[10px] px-3.5 text-[13.5px] font-medium transition-opacity disabled:opacity-40"
        style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text2)' }}
      >
        <Printer className="h-4 w-4" />
        הדפסה
      </button>
    </>
  )
}
