/**
 * 前端图片压缩工具（Canvas API，零依赖）。
 * 将 File/Blob 压缩为 data:image/webp 格式的 Data URI，
 * 可直接嵌入 markdown `![](dataUri)`，无需外部存储。
 */

const MAX_WIDTH = 1200
const DEFAULT_QUALITY = 0.65

/** 压缩图片文件，返回 data:image/webp;base64 Data URI */
export function compressImage(
  file: File | Blob,
  maxWidth = MAX_WIDTH,
  quality = DEFAULT_QUALITY,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        const canvas = document.createElement('canvas')
        let w = img.width
        let h = img.height
        if (w > maxWidth) {
          h = Math.round(h * maxWidth / w)
          w = maxWidth
        }
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/webp', quality))
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })
}

/** 判断文件是否为图片类型 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

/** 判断 ClipboardItem 是否包含图片 */
export function hasImageInClipboard(items: DataTransferItemList): boolean {
  for (const item of items) {
    if (item.type.startsWith('image/')) return true
  }
  return false
}
