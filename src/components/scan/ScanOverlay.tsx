'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import ScanStep from './ScanStep'

// The scan flow, opened by the upload zone on the home page when photos were picked (PDFs never come here).
// A full-screen layer over the page — no route, no navigation, the page's own session. Several photos are
// scanned one after the other: crop → read → review → save, then the next.

interface Props {
  /** The photos to scan, in the order they were picked. */
  files: readonly File[]
  /** A receipt was saved: the page refreshes its list. */
  onSaved: () => void
  /** The batch is finished or abandoned. */
  onClose: () => void
}

export default function ScanOverlay({ files, onSaved, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [queue, setQueue] = useState<File[]>(() => [...files])
  const [index, setIndex] = useState(0)
  const [attempt, setAttempt] = useState(0) // a retake swaps the photo → a fresh step (crop again)

  const isLast = index >= queue.length - 1

  const next = useCallback(() => {
    if (isLast) onClose()
    else setIndex((i) => i + 1)
  }, [isLast, onClose])

  const retake = useCallback((photo: File) => {
    setQueue((q) => q.map((f, i) => (i === index ? photo : f)))
    setAttempt((a) => a + 1)
  }, [index])

  // The page under the layer must not scroll while a finger works the crop frame.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const photo = queue[index]
  if (!photo) return null

  return (
    <div
      ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="סריקת קבלה" dir="rtl" data-testid="scan-overlay"
      className="fixed inset-0 z-[10000] flex flex-col overscroll-contain outline-none"
      style={{ background: 'var(--bg-grad)', color: 'var(--text)' }}
    >
      <ScanStep
        key={`${index}-${attempt}`}
        file={photo}
        position={{ current: index + 1, total: queue.length }}
        isLast={isLast}
        onSaved={onSaved}
        onNext={next}
        onClose={onClose}
        onRetake={retake}
      />
    </div>
  )
}
