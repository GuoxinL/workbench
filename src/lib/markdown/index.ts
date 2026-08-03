import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import { highlightExtension } from './highlight'
import { wikilinkExtension } from './wikilink'

export interface RenderOptions {
  /**
   * 解析双链标题为文章 id（null 表示未找到，会标记 .missing，对应 L5/L8）。
   * 不传则不标记缺失，所有双链按已存在渲染。
   */
  resolve?: (title: string) => string | null
  /**
   * 把图片 key 改写为可显示 URL（P2 ⑥ 渲染端）。
   * - git key（`images/<sha>`）→ raw 直链（同步，由调用方按 config 构造）
   * - 本地 key（`local-img:<sha>`）→ 原样返回，交由 `resolveImagesInContainer` 异步二次解析为 object URL
   * 不传则保留原 src。
   */
  resolveImage?: (key: string) => string
}

const attrEsc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * 渲染知识库文章正文为安全 HTML。
 * 管线：marked（GFM）+ 自定义扩展（==高亮==、[[双链]]）→ DOMPurify 消毒。
 * 设计 §2.5：以 DOMPurify 替代旧 util.esc() 的全量转义；用户内容渲染前必须消毒。
 *
 * 图片 key 还原（P2 ⑥）：通过 `resolveImage` 同步把 git key 改写为 raw 直链；
 * `local-img:` 方案已在 DOMPurify 白名单内放行，供阅读视图异步解析为 object URL。
 */
export function renderMarkdown(src: string, opts: RenderOptions = {}): string {
  const marked = new Marked({ gfm: true, breaks: false })
  marked.use({
    extensions: [highlightExtension(), wikilinkExtension(opts.resolve)],
    renderer: {
      // marked v18 以 token 对象入参；旧版为位置参数，故做兼容
      image(this: unknown, token: any) {
        const t = typeof token === 'string' ? { href: token } : token
        const href: string = t?.href ?? ''
        const text: string = t?.text ?? ''
        const title: string | undefined = t?.title
        const resolved = opts.resolveImage ? opts.resolveImage(href) : href
        const titleAttr = title ? ` title="${attrEsc(title)}"` : ''
        return `<img src="${attrEsc(resolved)}" alt="${attrEsc(text)}"${titleAttr}>`
      },
    },
  })
  const raw = marked.parse(src, { async: false }) as string
  return DOMPurify.sanitize(raw, {
    // 放行本地图片 key 方案，待阅读视图异步解析为 object URL（极简模式图片存于浏览器 IDB）
    ADD_URI_SAFE_ATTR: ['src'],
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|local-img):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  })
}

/**
 * 阅读视图异步解析容器内的图片 key（P2 ⑥ 极简模式）。
 * 遍历 `local-img:` / `images/` 开头的 src，经 `resolve` 拿到真实 URL 后回写 `img.src`；
 * 缓存避免重复生成 object URL。需在 `v-html` 渲染后调用（浏览器环境）。
 */
export async function resolveImagesInContainer(
  container: HTMLElement,
  resolve: (key: string) => Promise<string>,
): Promise<void> {
  const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[]
  const cache = new Map<string, string>()
  for (const img of imgs) {
    const src = img.getAttribute('src') || ''
    if (!/^(local-img:|images\/)/.test(src)) continue
    try {
      let url = cache.get(src)
      if (!url) {
        url = await resolve(src)
        cache.set(src, url)
      }
      if (url) img.src = url
    } catch {
      /* 解析失败保留原 key（破图），不中断其余图片 */
    }
  }
}
