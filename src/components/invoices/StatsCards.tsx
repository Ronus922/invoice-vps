'use client'

import { FileCheck, Mail, FolderSync } from 'lucide-react'
import type { Invoice } from '@/lib/entities'

interface CardDef {
  key: string
  label: string
  icon: typeof FileCheck
  gradient: string
  glow: string
  getValue: (invoices: Invoice[], extra: StatsExtras) => string | number
  getSub: (invoices: Invoice[], extra: StatsExtras) => string
}

interface StatsExtras {
  lastEmailScanAt: string | null
  lastFolderScanAt: string | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('he-IL')
}

function formatTime(iso: string | null): string {
  if (!iso) return 'טרם בוצעה סריקה'
  return new Date(iso).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  })
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
    key: 'lastEmailScan',
    label: 'סריקת מייל אחרונה',
    icon: Mail,
    gradient: 'from-amber-500 to-orange-500',
    glow: 'shadow-amber-500/25',
    getValue: (_invoices, extra) => formatDate(extra.lastEmailScanAt),
    getSub: (_invoices, extra) => formatTime(extra.lastEmailScanAt),
  },
  {
    key: 'lastFolderScan',
    label: 'סריקת תיקייה אחרונה',
    icon: FolderSync,
    gradient: 'from-violet-500 to-purple-500',
    glow: 'shadow-violet-500/25',
    getValue: (_invoices, extra) => formatDate(extra.lastFolderScanAt),
    getSub: (_invoices, extra) => formatTime(extra.lastFolderScanAt),
  },
]

interface StatsCardsProps {
  invoices: Invoice[]
  lastEmailScanAt: string | null
  lastFolderScanAt: string | null
}

export default function StatsCards({
  invoices = [],
  lastEmailScanAt,
  lastFolderScanAt,
}: StatsCardsProps) {
  const extra: StatsExtras = { lastEmailScanAt, lastFolderScanAt }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.key}
            className={`relative bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-4 sm:p-5 shadow-xl ${card.glow} hover:bg-white/15 transition-all duration-300 hover:-translate-y-0.5`}
          >
            <div className="flex items-start gap-3 mb-2">
              <div
                className={`bg-gradient-to-br ${card.gradient} p-2.5 rounded-xl shadow-lg flex-shrink-0`}
              >
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/60 font-medium mb-1 truncate">{card.label}</p>
                <p className="text-2xl font-bold text-white">{card.getValue(invoices, extra)}</p>
              </div>
            </div>
            <p className="text-xs text-white/40">{card.getSub(invoices, extra)}</p>
            <div
              className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${card.gradient} rounded-b-2xl opacity-60`}
            />
          </div>
        )
      })}
    </div>
  )
}
