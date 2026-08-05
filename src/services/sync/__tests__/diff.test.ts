import { describe, expect, it } from 'vitest'
import { planSync, type SyncItem } from '../diff'

const item = (id: string, localSha: string, deleted = false): SyncItem => ({ id, localSha, deleted })

describe('planSync（矩阵 A–G，详见 02-plan.md §五）', () => {
  it('A：本地无 / 远端有 → pull', () => {
    const r = planSync([], { x: 'tx' }, {})
    expect(r.pull).toEqual(['x'])
    expect(r.skip).toEqual([])
  })

  it('B：本地有(存活) / 远端无 → push（新建）', () => {
    const r = planSync([item('x', 'lx')], {}, {})
    expect(r.push).toEqual(['x'])
  })

  it('C：两边存活 / localSha === treeSha → 跳过（不更新）', () => {
    const r = planSync([item('x', 'same')], { x: 'same' }, { x: 'same' })
    expect(r.skip).toEqual(['x'])
    expect(r.push).toEqual([])
    expect(r.pull).toEqual([])
  })

  it('D：本地未动(base===localSha) / 远端改(tree≠base) → pull', () => {
    const r = planSync([item('x', 'base')], { x: 'tree' }, { x: 'base' })
    expect(r.pull).toEqual(['x'])
    expect(r.push).toEqual([])
  })

  it('E：远端未动(tree===base) / 本地改 → push', () => {
    const r = planSync([item('x', 'local')], { x: 'base' }, { x: 'base' })
    expect(r.push).toEqual(['x'])
    expect(r.pull).toEqual([])
  })

  it('F：双方都改且不同 → conflicts（LWW 合并后推送）', () => {
    const r = planSync([item('x', 'local')], { x: 'tree' }, { x: 'base' })
    expect(r.conflicts).toEqual(['x'])
  })

  it('G：本地软删除 / 远端有 → del（带远端 sha 锁删除）', () => {
    const r = planSync([item('x', 'lx', true)], { x: 'tx' }, { x: 'tx' })
    expect(r.del).toEqual(['x'])
    expect(r.push).toEqual([])
  })

  it('首轮（base 缺失）localSha≠tree 按冲突安全处理（不盲目覆盖远端）', () => {
    const r = planSync([item('x', 'local')], { x: 'tree' }, {})
    expect(r.conflicts).toEqual(['x'])
    expect(r.push).toEqual([])
  })

  it('首轮（base 缺失）localSha===tree 视为跳过', () => {
    const r = planSync([item('x', 'same')], { x: 'same' }, {})
    expect(r.skip).toEqual(['x'])
  })

  it('本地软删除但远端已无该文件 → 无动作（留给 TTL 清理墓碑）', () => {
    const r = planSync([item('x', 'lx', true)], {}, {})
    expect(r).toEqual({ pull: [], push: [], del: [], conflicts: [], skip: [] })
  })
})
