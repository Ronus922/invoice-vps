// Which of the files picked in the upload zone go where. A PDF keeps the path it always had (upload →
// extract → save). A photo goes through the scan flow: crop in the browser → OCR → a form to review → save.
// Pure, so the rule is tested without a browser (tests/scan-files.test.ts).

type NamedFile = Pick<File, 'name' | 'type'>

// The very test the upload zone has always used for a PDF — kept as it was so the PDF path does not change.
export function isPdfFile(f: NamedFile): boolean {
  return f.type.includes('pdf') || f.name.endsWith('.pdf')
}

// Some Android pickers hand over a HEIC/JPEG with an empty MIME type; the extension is then all there is.
const PHOTO_EXTENSION = /\.(jpe?g|png|heic|heif|webp)$/i

export function isPhotoFile(f: NamedFile): boolean {
  if (isPdfFile(f)) return false
  return f.type.startsWith('image/') || (f.type === '' && PHOTO_EXTENSION.test(f.name))
}

/** PDFs and photos, each in the order they were picked. Anything else is ignored, as it always was. */
export function splitUploads<T extends NamedFile>(files: readonly T[]): { pdfs: T[]; photos: T[] } {
  const pdfs: T[] = []
  const photos: T[] = []
  for (const f of files) {
    if (isPdfFile(f)) pdfs.push(f)
    else if (isPhotoFile(f)) photos.push(f)
  }
  return { pdfs, photos }
}
