'use client'

import { useState, useMemo } from 'react'
import { ChevronRight, ChevronLeft, Calendar } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  format,
  isSameMonth,
  isSameDay,
  isToday,
} from 'date-fns'
import { he } from 'date-fns/locale'

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export default function DatePicker({
  value,
  onChange,
  placeholder = 'בחר תאריך',
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)

  const selectedDate = useMemo(() => {
    if (!value) return null
    return new Date(value)
  }, [value])

  const [viewDate, setViewDate] = useState(() => selectedDate || new Date())

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(viewDate)
    const monthEnd = endOfMonth(viewDate)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

    const days: Date[] = []
    let day = calStart
    while (day <= calEnd) {
      days.push(day)
      day = addDays(day, 1)
    }
    return days
  }, [viewDate])

  const handleSelect = (day: Date) => {
    const isoDate = format(day, 'yyyy-MM-dd')
    onChange(isoDate)
    setOpen(false)
  }

  const displayValue = useMemo(() => {
    if (!value) return ''
    const d = new Date(value)
    return format(d, 'd בMMMM yyyy', { locale: he })
  }, [value])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex h-9 w-full items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm transition-all hover:bg-white/15 focus:border-blue-400/50 ${value ? 'text-white' : 'text-white/30'} ${className || ''}`}
          dir="rtl"
        >
          <Calendar className="w-4 h-4 text-white/40 flex-shrink-0" />
          <span className="flex-1 text-right truncate">
            {displayValue || placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-3" align="start" dir="rtl">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setViewDate(addMonths(viewDate, 1))}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/60"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-white">
            {format(viewDate, 'MMMM yyyy', { locale: he })}
          </span>
          <button
            onClick={() => setViewDate(subMonths(viewDate, 1))}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/60"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="h-8 flex items-center justify-center text-[11px] font-medium text-white/40"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {calendarDays.map((day, i) => {
            const inMonth = isSameMonth(day, viewDate)
            const selected = selectedDate && isSameDay(day, selectedDate)
            const today = isToday(day)

            return (
              <button
                key={i}
                onClick={() => handleSelect(day)}
                className={`h-8 w-full rounded-lg text-sm transition-all flex items-center justify-center
                  ${!inMonth ? 'text-white/15' : ''}
                  ${selected ? 'bg-blue-500 text-white font-semibold' : ''}
                  ${!selected && today ? 'bg-blue-500/20 text-blue-300 font-semibold' : ''}
                  ${!selected && !today && inMonth ? 'text-white hover:bg-white/10' : ''}
                  ${!selected && !today && !inMonth ? 'hover:bg-white/5' : ''}
                `}
              >
                {format(day, 'd')}
              </button>
            )
          })}
        </div>

        {/* Today shortcut */}
        <div className="mt-2 pt-2 border-t border-white/10">
          <button
            onClick={() => {
              const today = new Date()
              setViewDate(today)
              handleSelect(today)
            }}
            className="w-full text-xs text-blue-300 hover:text-blue-200 py-1 transition-colors"
          >
            היום
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
