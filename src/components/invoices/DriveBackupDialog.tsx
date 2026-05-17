'use client'

import { X, HardDrive } from 'lucide-react'
import DriveBackupSettings from './DriveBackupSettings'

interface DriveBackupDialogProps {
  onClose: () => void
}

export default function DriveBackupDialog({ onClose }: DriveBackupDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-gradient-to-b from-slate-800 to-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-500/30 to-indigo-600/20 border border-blue-400/30 p-2.5 rounded-xl">
              <HardDrive className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">גיבוי לגוגל דרייב</h3>
              <p className="text-xs text-white/40">גיבוי אוטומטי בתיקיות שנה/חודש</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <DriveBackupSettings />
      </div>
    </div>
  )
}
