'use client'

import { CloudUpload } from 'lucide-react'
import { SidePanel } from '@/components/ui/side-panel'
import DriveBackupSettings from './DriveBackupSettings'

interface DriveBackupDialogProps {
  open: boolean
  onClose: () => void
}

export default function DriveBackupDialog({ open, onClose }: DriveBackupDialogProps) {
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="גיבוי לגוגל דרייב"
      subtitle="גיבוי אוטומטי בתיקיות שנה/חודש"
      icon={CloudUpload}
    >
      <DriveBackupSettings />
    </SidePanel>
  )
}
