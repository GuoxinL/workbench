/**
 * ProseMirror 粘贴图片插件。
 * 拦截 Ctrl+V / 右键粘贴中的图片，压缩后以 data URI 插入编辑器。
 */
import { Plugin } from '@milkdown/prose/state'
import { compressImage, isImageFile } from '@/lib/image'

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

/** 创建 paste-image ProseMirror 插件 */
export function pasteImagePlugin() {
  return new Plugin({
    props: {
      handlePaste(view, e) {
        const files = getImageFiles(e)
        if (files.length === 0) return false

        e.preventDefault()
        ;(async () => {
          for (const file of files) {
            try {
              // 压缩为 webp data URI（存储必须压缩）
              const dataUri = await compressImage(file)
              // 插入真正的 image 节点（而非原始 markdown 文本，否则 WYSIWYG 不渲染）
              const st = view.state
              const imgType = st.schema.nodes.image
              if (!imgType) continue
              const tr = st.tr.replaceSelectionWith(imgType.create({ src: dataUri, alt: '' }))
              view.dispatch(tr)
            } catch (err) {
              console.warn('[paste-image] compress failed', err)
            }
          }
        })()
        return true
      },
    },
  })
}
