/**
 * 图片去重 key 用的哈希 / 编码工具。
 * - `crypto.subtle` 在浏览器（安全上下文）与 Node 18+ 均可用，测试环境（jsdom + Node）同样可用。
 * - 图片 key 由内容 hash 决定 ⇒ 同图幂等：重复粘贴不会产生新 blob / 新 key，避免孤儿堆积。
 */

/** 计算 ArrayBuffer 的 SHA-256 hex 串。 */
export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** ArrayBuffer → base64（二进制直传 GitHub Contents API 用，不做二次编码）。 */
export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
