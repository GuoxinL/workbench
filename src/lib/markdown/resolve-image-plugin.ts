/**
 * 编辑器（WYSIWYG）图片显示补丁（P2 ⑥）。
 * Milkdown 的 image 节点 `src` 存的是图云层 key（local-img:<sha> / images/<sha>），无法被浏览器直接显示；
 * 此插件在每次渲染后把命中 key 的 `<img>` 重写为可显示 URL（本地生成 object URL，git 组装 raw 直链）。
 * 只改 DOM 展示、不改文档模型，故序列化导出的仍是 key（保证存储/同步干净）。
 */
import { Plugin } from '@milkdown/prose/state'

export function resolveEditorImagesPlugin(resolve: (key: string) => Promise<string>) {
  const cache = new Map<string, string>()
  async function patch(view: { dom: HTMLElement }) {
    const imgs = Array.from(view.dom.querySelectorAll('img')) as HTMLImageElement[]
    for (const img of imgs) {
      const src = img.getAttribute('src') || ''
      if (!/^(local-img:|images\/)/.test(src)) continue
      try {
        let url = cache.get(src)
        if (!url) {
          url = await resolve(src)
          cache.set(src, url)
        }
        if (url && img.src !== url) img.src = url
      } catch {
        /* 解析失败保留原 key */
      }
    }
  }
  return new Plugin({
    view(editorView) {
      const run = () => {
        void patch(editorView as unknown as { dom: HTMLElement })
      }
      setTimeout(run, 0)
      return { update: run }
    },
  })
}
