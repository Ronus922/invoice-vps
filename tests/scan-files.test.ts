import { describe, expect, it } from 'vitest'
import { isPdfFile, isPhotoFile, splitUploads } from '@/lib/scan/files'

const f = (name: string, type: string) => ({ name, type })

describe('splitUploads — what the upload zone does with each picked file', () => {
  it('a PDF keeps the existing path: by MIME type or by a .pdf name', () => {
    expect(isPdfFile(f('invoice.pdf', 'application/pdf'))).toBe(true)
    expect(isPdfFile(f('scan.pdf', ''))).toBe(true) // some pickers give no type
    expect(isPdfFile(f('photo.jpg', 'image/jpeg'))).toBe(false)
  })

  it('JPG / PNG / HEIC from the camera or gallery go to the scan flow', () => {
    for (const photo of [f('IMG_1.jpg', 'image/jpeg'), f('a.png', 'image/png'), f('IMG_2.heic', 'image/heic'), f('b.HEIF', 'image/heif')]) {
      expect(isPhotoFile(photo)).toBe(true)
    }
  })

  it('a photo whose MIME type is empty is recognised by its extension (Android pickers)', () => {
    expect(isPhotoFile(f('IMG_0001.HEIC', ''))).toBe(true)
    expect(isPhotoFile(f('receipt.jpeg', ''))).toBe(true)
    expect(isPhotoFile(f('notes.txt', ''))).toBe(false)
  })

  it('a PDF is never a photo, even when named like one', () => {
    expect(isPhotoFile(f('photo.jpg.pdf', 'application/pdf'))).toBe(false)
    expect(isPhotoFile(f('x.pdf', ''))).toBe(false)
  })

  it('a mixed selection is split, each side keeping the order it was picked in', () => {
    const picked = [
      f('1.jpg', 'image/jpeg'), f('a.pdf', 'application/pdf'), f('2.png', 'image/png'),
      f('b.pdf', 'application/pdf'), f('c.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), f('3.heic', 'image/heic'),
    ]
    const { pdfs, photos } = splitUploads(picked)
    expect(pdfs.map((x) => x.name)).toEqual(['a.pdf', 'b.pdf'])
    expect(photos.map((x) => x.name)).toEqual(['1.jpg', '2.png', '3.heic'])
  })

  it('only PDFs → nothing for the scan flow; only photos → nothing for the PDF queue; junk → nothing at all', () => {
    expect(splitUploads([f('a.pdf', 'application/pdf')]).photos).toEqual([])
    expect(splitUploads([f('1.jpg', 'image/jpeg')]).pdfs).toEqual([])
    expect(splitUploads([f('x.zip', 'application/zip')])).toEqual({ pdfs: [], photos: [] })
    expect(splitUploads([])).toEqual({ pdfs: [], photos: [] })
  })
})
