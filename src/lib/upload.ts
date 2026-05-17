const MAX_DIMENSION = 2048
const JPEG_QUALITY = 0.82

function compressImage(file: File): Promise<File> {
  // Only compress images, not PDFs
  if (!file.type.startsWith('image/')) return Promise.resolve(file)

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      let { width, height } = img
      // Skip compression for small images
      if (width <= MAX_DIMENSION && height <= MAX_DIMENSION && file.size < 1024 * 1024) {
        resolve(file)
        return
      }

      // Scale down if needed
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }))
          } else {
            resolve(file)
          }
        },
        'image/jpeg',
        JPEG_QUALITY
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file) // fallback to original
    }

    img.src = url
  })
}

export async function uploadFile(file: File): Promise<string> {
  const compressed = await compressImage(file)

  const formData = new FormData()
  formData.append('file', compressed)

  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  })

  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    if (res.status === 401) {
      throw new Error('נדרשת התחברות מחדש — רענן את העמוד')
    }
    if (res.status === 413) {
      throw new Error('הקובץ גדול מדי — נסה לצלם מקרוב יותר')
    }
    throw new Error('שגיאת שרת — נסה שוב מאוחר יותר')
  }

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Upload failed')
  }

  const { file_url } = await res.json()
  return file_url
}
