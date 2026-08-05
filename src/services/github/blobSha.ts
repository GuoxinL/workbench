/**
 * Git blob SHA-1：SHA-1("blob " + byteLength + "\0" + utf8(content))。
 *
 * 与 GitHub 在存储 blob 时计算的指纹**逐字节一致**——本地用同样的公式算一遍，
 * 就能和远端目录列表里返回的 `sha` 直接比对，从而实现「sha 一致 = 没变 = 不更新」。
 *
 * 浏览器（安全上下文）与 Node 20（Vitest）均原生提供 `crypto.subtle`。
 */
export async function gitBlobSha(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content)
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`)
  const buf = new Uint8Array(header.length + bytes.length)
  buf.set(header)
  buf.set(bytes, header.length)
  const digest = await crypto.subtle.digest('SHA-1', buf)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
