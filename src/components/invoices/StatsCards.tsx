'use client'

import { FileCheck, Mail, FolderSync } from 'lucide-react'
import type { Invoice } from '@/lib/entities'

interface CardDef {
  key: string
  label: string
  icon: typeof FileCheck
  iconColor: string
  iconBg: string
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

function formatTimeSub(iso: string | null): string {
  if (!iso) return 'טרם בוצעה סריקה'
  const time = new Date(iso).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `בשעה ${time}`
}

const cards: CardDef[] = [
  {
    key: 'processed',
    label: 'חשבוניות שעובדו',
    icon: FileCheck,
    iconColor: '#2dd4bf',
    iconBg: 'rgba(45, 212, 191, 0.14)',
    getValue: (invoices) => invoices.length,
    getSub: (invoices) => `${invoices.length} קבצים במערכת`,
  },
  {
    key: 'lastEmailScan',
    label: 'סריקת מייל אחרונה',
    icon: Mail,
    iconColor: '#f9a84a',
    iconBg: 'rgba(249, 168, 74, 0.14)',
    getValue: (_invoices, extra) => formatDate(extra.lastEmailScanAt),
    getSub: (_invoices, extra) => formatTimeSub(extra.lastEmailScanAt),
  },
  {
    key: 'lastFolderScan',
    label: 'סריקת תיקייה אחרונה',
    icon: FolderSync,
    iconColor: '#a77af6',
    iconBg: 'rgba(167, 122, 246, 0.14)',
    getValue: (_invoices, extra) => formatDate(extra.lastFolderScanAt),
    getSub: (_invoices, extra) => formatTimeSub(extra.lastFolderScanAt),
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.key}
            className="flex items-center gap-3.5 rounded-2xl px-5 py-[18px]"
            style={{ background: 'var(--stat-card)', border: '1px solid var(--border)' }}
          >
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{ background: card.iconBg }}
            >
              <Icon className="h-5 w-5" style={{ color: card.iconColor }} />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px]" style={{ color: 'var(--text3)' }}>
                {card.label}
              </span>
              <span dir="ltr" className="text-right text-[22px] font-extrabold leading-[1.1]">
                {card.getValue(invoices, extra)}
              </span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {card.getSub(invoices, extra)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
