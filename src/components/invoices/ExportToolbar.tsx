'use client'

import { useState } from 'react'
import { Download, Printer, Loader2, FileSpreadsheet } from 'lucide-react'
import type { Invoice } from '@/lib/entities'

interface ExportToolbarProps {
  filteredInvoices: Invoice[]
  onDownloaded?: (isoDate: string) => void
}

export default function ExportToolbar({
  filteredInvoices = [],
  onDownloaded,
}: ExportToolbarProps) {
  const [isZipping, setIsZipping] = useState(false)

  const filesCount = filteredInvoices.filter((i) => i.file_url).length

  const handlePrint = () => {
    if (filteredInvoices.length === 0) return

    const rows = filteredInvoices
      .map(
        (inv) => `
      <tr>
        <td>${inv.date || '—'}</td>
        <td>${inv.vendor || '—'}</td>
        <td>${inv.doc_number || '—'}</td>
        <td>${inv.description || '—'}</td>
        <td>₪${(inv.total || 0).toLocaleString('he-IL')}</td>
        <td>${inv.payment_method || '—'}</td>
        <td>${inv.category || '—'}</td>
      </tr>`
      )
      .join('')

    const total = filteredInvoices.reduce((acc, inv) => acc + (inv.total || 0), 0)

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
        <tfoot><tr><td colspan="4">סה"כ (${filteredInvoices.length} חשבוניות)</td><td>₪${total.toLocaleString('he-IL')}</td><td colspan="2"></td></tr></tfoot>
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
      'לפני מע"מ',
      'מע"מ',
      'סה"כ',
      'תשלום',
      'קטגוריה',
    ]
    const rows = filteredInvoices.map((inv) => [
      inv.date || '',
      inv.vendor || '',
      inv.doc_number || '',
      inv.description || '',
      inv.pretax ?? '',
      inv.vat ?? '',
      inv.total ?? '',
      inv.payment_method || '',
      inv.category || '',
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
          url: inv.file_url!,
          name: inv.file_name || `${inv.vendor}_${inv.doc_number}.pdf`,
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

      if (onDownloaded) onDownloaded(new Date().toISOString())
    } finally {
      setIsZipping(false)
    }
  }

  return (
    <div className="flex gap-2 flex-wrap" dir="rtl">
      <button
        onClick={handleZip}
        disabled={isZipping || filesCount === 0}
        className="bg-indigo-500/20 text-indigo-300 px-4 py-2 text-sm font-medium rounded-xl flex items-center gap-2 hover:bg-indigo-500/30 border border-indigo-500/30 hover:text-indigo-200 transition-all disabled:opacity-40"
      >
        {isZipping ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {isZipping ? 'מכין ZIP...' : `הורד ZIP (${filesCount})`}
      </button>
      <button
        onClick={handleCsv}
        disabled={filteredInvoices.length === 0}
        className="flex items-center gap-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 hover:text-emerald-200 text-sm font-medium px-4 py-2 rounded-xl transition-all disabled:opacity-40"
      >
        <FileSpreadsheet className="w-4 h-4" />
        ייצוא לאקסל ({filteredInvoices.length})
      </button>
      <button
        onClick={handlePrint}
        disabled={filteredInvoices.length === 0}
        className="flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white/70 hover:text-white text-sm font-medium px-4 py-2 rounded-xl transition-all disabled:opacity-40"
      >
        <Printer className="w-4 h-4" />
        הדפסה ({filteredInvoices.length})
      </button>
    </div>
  )
}
