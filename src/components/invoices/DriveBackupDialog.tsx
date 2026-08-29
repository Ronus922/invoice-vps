'use client'

import { CloudUpload, X } from 'lucide-react'
import DriveBackupSettings from './DriveBackupSettings'

interface DriveBackupDialogProps {
  onClose: () => void
}

export default function DriveBackupDialog({ onClose }: DriveBackupDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[460px] bg-[#0e1f3d] border border-[rgba(126,152,210,0.22)] rounded-[20px] shadow-[0_32px_80px_rgba(4,10,26,0.65)] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between gap-3 px-[26px] pt-6 pb-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex-shrink-0 rounded-[14px] bg-[rgba(45,212,191,0.12)] border border-[rgba(45,212,191,0.25)] flex items-center justify-center">
              <CloudUpload className="w-5 h-5 text-[#2dd4bf]" />
            </div>
            <div>
              <h3 className="text-[19px] font-extrabold text-[#f4f7fd]">גיבוי לגוגל דרייב</h3>
              <p className="text-[13.5px] text-[#8fb0e8]">גיבוי אוטומטי בתיקיות שנה/חודש</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="סגירה"
            className="w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-[26px] pb-6 pt-5">
          <DriveBackupSettings />
        </div>
      </div>
    </div>
  )
}
