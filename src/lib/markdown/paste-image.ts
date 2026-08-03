/**
 * ProseMirror 粘贴图片插件。
 * 拦截 Ctrl+V / 右键粘贴中的图片：压缩后上传到图云层（P2 ⑥）拿到可引用 key 嵌入正文；
 * 若未注入上传函数或上传失败，则回退为 data URI 内嵌（保证编辑器不破图）。
 */
import { Plugin } from '@milkdown/prose/state'
import { compressImageBlob, blobToDataUri, isImageFile } from '@/lib/image'

export interface PasteImageOptions {
  /** 图云层上传：压缩后的 Blob → 可引用 key（local-img:<sha> / images/<sha>）。 */
  upload?: (blob: Blob) => Promise<string>
}

/** 从粘贴事件中获取图片 File 列表 */
function getImageFiles(e: ClipboardEvent): File[] {
  const files: File[] = []
  if (!e.clipboardData) return files
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file && isImageFile(file)) files.push(file)
    }
  }
  if (files.length === 0 && e.clipboardData.files.length > 0) {
    for (const f of e.clipboardData.files) {
      if (isImageFile(f)) files.push(f)
    }
  }
  return files
}

/** 压缩 → 取可嵌入的 src（优先上传拿 key，失败回退 data URI） */
export async function toSrc(file: File, upload?: (blob: Blob) => Promise<string>): Promise<string> {
  const blob = await compressImageBlob(file)
  if (upload) {
    try {
      return await upload(blob)
    } catch {
      /* 上传失败：回退内嵌 data URI，至少图片可见 */
    }
  }
  return blobToDataUri(blob)
}

/** 创建 paste-image ProseMirror 插件 */
export function pasteImagePlugin(opts: PasteImageOptions = {}) {
  return new Plugin({
    props: {
      handlePaste(view, e) {
        const files = getImageFiles(e)
        if (files.length === 0) return false

        e.preventDefault()
        ;(async () => {
          for (const file of files) {
            try {
              const src = await toSrc(file, opts.upload)
              // 插入真正的 image 节点（而非原始 markdown 文本，否则 WYSIWYG 不渲染）
              const st = view.state
              const imgType = st.schema.nodes.image
              if (!imgType) continue
              const tr = st.tr.replaceSelectionWith(imgType.create({ src, alt: '' }))
              view.dispatch(tr)
            } catch (err) {
              console.warn('[paste-image] 处理失败', err)
            }
          }
        })()
        return true
      },
    },
  })
}
