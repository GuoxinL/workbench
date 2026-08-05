import { describe, expect, it } from 'vitest'
import { gitBlobSha } from '../blobSha'
import { createHash } from 'node:crypto'

/** 用 Node crypto 独立计算 git blob sha（与 WebCrypto 实现交叉验证公式正确性）。 */
function ref(content: string): string {
  const bytes = Buffer.from(content, 'utf8')
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

describe('gitBlobSha', () => {
  it('空内容 = git 空 blob 的已知 sha（e69de29…）', async () => {
    expect(await gitBlobSha('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
  })

  it('与 Node crypto 参考实现逐字节一致（含非 ASCII / 多字节）', async () => {
    const cases = ['', 'hello\n', '中文内容\nwith 多字节', 'a'.repeat(1000)]
    for (const c of cases) {
      expect(await gitBlobSha(c)).toBe(ref(c))
    }
  })

  it('内容变化即产生不同 sha（判定「是否变化」的基石）', async () => {
    const a = await gitBlobSha('v1')
    const b = await gitBlobSha('v2')
    expect(a).not.toBe(b)
    expect(a).toBe(ref('v1'))
  })
})
