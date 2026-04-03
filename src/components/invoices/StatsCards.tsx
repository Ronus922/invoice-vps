'use client'

import { FileCheck, TrendingUp, Clock, Download } from 'lucide-react'
import type { Invoice } from '@/lib/entities'

interface CardDef {
  key: string
  label: string
  icon: typeof FileCheck
  gradient: string
  glow: string
  getValue: (invoices: Invoice[], extra: { lastDownloadedAt: string | null }) => string | number
  getSub: (invoices: Invoice[], extra: { lastDownloadedAt: string | null }) => string
}

const cards: CardDef[] = [
  {
    key: 'processed',
    label: 'חשבוניות שעובדו',
    icon: FileCheck,
    gradient: 'from-emerald-500 to-teal-500',
    glow: 'shadow-emerald-500/25',
    getValue: (invoices) => invoices.length,
    getSub: (invoices) => `${invoices.length} קבצים במערכת`,
  },
  {
    key: 'total',
    label: 'סה"כ הוצאות',
    icon: TrendingUp,
    gradient: 'from-blue-500 to-cyan-500',
    glow: 'shadow-blue-500/25',
    getValue: (invoices) => {
      const sum = invoices.reduce((acc, inv) => acc + (inv.total || 0), 0)
      return `₪${sum.toLocaleString('he-IL', { minimumFractionDigits: 0 })}`
    },
    getSub: () => 'כולל מע"מ',
  },
  {
    key: 'lastRun',
    label: 'הרצה אחרונה',
    icon: Clock,
    gradient: 'from-amber-500 to-orange-500',
    glow: 'shadow-amber-500/25',
    getValue: (invoices) => {
      if (invoices.length === 0) return '—'
      const sorted = [...invoices].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      return new Date(sorted[0].created_at).toLocaleDateString('he-IL')
    },
    getSub: () => 'סריקה אוטומטית',
  },
  {
    key: 'lastDownload',
    label: 'הורדה אחרונה',
    icon: Download,
    gradient: 'from-purple-500 to-violet-500',
    glow: 'shadow-purple-500/25',
    getValue: (_invoices, extra) => {
      if (!extra?.lastDownloadedAt) return '—'
      return new Date(extra.lastDownloadedAt).toLocaleDateString('he-IL')
    },
    getSub: (_invoices, extra) => {
      if (!extra?.lastDownloadedAt) return 'טרם בוצעה הורדה'
      return new Date(extra.lastDownloadedAt).toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
      })
    },
  },
]

interface StatsCardsProps {
  invoices: Invoice[]
  lastDownloadedAt: string | null
}

export default function StatsCards({ invoices = [], lastDownloadedAt }: StatsCardsProps) {
  const extra = { lastDownloadedAt }
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.key}
            className={`relative bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-5 shadow-xl ${card.glow} hover:bg-white/15 transition-all duration-300 hover:-translate-y-0.5`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="text-right flex-1">
                <p className="text-xs text-white/60 font-medium mb-1">{card.label}</p>
                <p className="text-2xl font-bold text-white">{card.getValue(invoices, extra)}</p>
              </div>
              <div className={`bg-gradient-to-br ${card.gradient} p-2.5 rounded-xl shadow-lg ml-3 flex-shrink-0`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
            </div>
            <p className="text-xs text-white/40">{card.getSub(invoices, extra)}</p>
            <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${card.gradient} rounded-b-2xl opacity-60`} />
          </div>
        )
      })}
    </div>
  )
}
