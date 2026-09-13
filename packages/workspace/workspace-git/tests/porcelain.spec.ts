import { describe, expect, it } from 'vitest'
import {
  assertRelativePath, parseBranch, parseBranches, parseGraph, parseHead, parseStatus, parseWorkTree,
} from '../src/porcelain.ts'

describe('parseStatus', () => {
  it('decodes one record per changed path', () => {
    expect(parseStatus('M  a.ts\0 M b.ts\0?? new.md\0')).toEqual([
      { index: 'M', worktree: ' ', path: 'a.ts' },
      { index: ' ', worktree: 'M', path: 'b.ts' },
      { index: '?', worktree: '?', path: 'new.md' },
    ])
  })

  it('keeps a conflict pair verbatim', () => {
    expect(parseStatus('UU conf.ts\0')).toEqual([{ index: 'U', worktree: 'U', path: 'conf.ts' }])
  })

  it('folds the source record of a rename into one entry', () => {
    // The -z form drops the arrow and puts the source path in its own record,
    // which is what made a rename read as a phantom second row.
    expect(parseStatus('R  renamed.txt\0a.txt\0?? untracked.md\0')).toEqual([
      { index: 'R', worktree: ' ', path: 'renamed.txt', origPath: 'a.txt' },
      { index: '?', worktree: '?', path: 'untracked.md' },
    ])
  })

  it('folds a copy and a worktree-side rename the same way', () => {
    expect(parseStatus('C  copy.ts\0source.ts\0')).toEqual([
      { index: 'C', worktree: ' ', path: 'copy.ts', origPath: 'source.ts' },
    ])
    expect(parseStatus(' R moved.ts\0before.ts\0')).toEqual([
      { index: ' ', worktree: 'R', path: 'moved.ts', origPath: 'before.ts' },
    ])
  })

  it('drops the source path when Git emitted no second record', () => {
    expect(parseStatus('R  renamed.txt\0')).toEqual([{ index: 'R', worktree: ' ', path: 'renamed.txt' }])
  })

  it('reads an empty status as no entries', () => {
    expect(parseStatus('')).toEqual([])
    expect(parseStatus('\0')).toEqual([])
  })

  it('keeps a path that itself contains spaces', () => {
    expect(parseStatus('M  a b/c d.ts\0')).toEqual([{ index: 'M', worktree: ' ', path: 'a b/c d.ts' }])
  })
})

describe('parseBranches', () => {
  it('lists branches in Git order with the attached name', () => {
    expect(parseBranches('dev\nmain\n', 'main')).toEqual({ current: 'main', branches: ['dev', 'main'] })
  })

  it('drops the synthetic detached-HEAD row', () => {
    expect(parseBranches('(HEAD detached at c721926)\ndev\nmain\n', null))
      .toEqual({ current: null, branches: ['dev', 'main'] })
  })

  it('reports a detached HEAD as no attached branch', () => {
    expect(parseBranches('dev\n', null)).toEqual({ current: null, branches: ['dev'] })
  })

  it('tolerates CRLF and an empty listing', () => {
    expect(parseBranches('dev\r\nmain\r\n', 'dev')).toEqual({ current: 'dev', branches: ['dev', 'main'] })
    expect(parseBranches('', null)).toEqual({ current: null, branches: [] })
  })
})

describe('parseGraph', () => {
  it('decodes hash, parents, refs, and subject', () => {
    expect(parseGraph('aaa\x1fbbb ccc\x1fHEAD -> main, tag: v1\x1ffeat: subject\n')).toEqual([
      { hash: 'aaa', parents: ['bbb', 'ccc'], refs: ['HEAD -> main', 'tag: v1'], subject: 'feat: subject' },
    ])
  })

  it('reports a root commit as parentless and undecorated', () => {
    expect(parseGraph('aaa\x1f\x1f\x1froot commit\n')).toEqual([
      { hash: 'aaa', parents: [], refs: [], subject: 'root commit' },
    ])
  })

  it('keeps spaces and punctuation inside the subject and refs', () => {
    expect(parseGraph('aaa\x1f\x1fHEAD -> main, tag: v1\x1ffix(scope): a, b\n')[0]).toEqual({
      hash: 'aaa',
      parents: [],
      refs: ['HEAD -> main', 'tag: v1'],
      subject: 'fix(scope): a, b',
    })
  })

  it('reads an empty log as no rows', () => {
    expect(parseGraph('')).toEqual([])
    expect(parseGraph('\n')).toEqual([])
  })

  it('tolerates CRLF', () => {
    expect(parseGraph('aaa\x1f\x1f\x1fx\r\nbbb\x1f\x1f\x1fy\r\n')).toHaveLength(2)
  })
})

describe('parseWorkTree', () => {
  it('reports the two answers Git prints', () => {
    expect(parseWorkTree('true\n')).toBe(true)
    expect(parseWorkTree('false\n')).toBe(false)
  })

  it('reports no answer when Git printed none', () => {
    expect(parseWorkTree('')).toBeNull()
    expect(parseWorkTree('True\n')).toBeNull()
  })
})

describe('parseHead', () => {
  it('reports the hash, or nothing for an unborn branch', () => {
    expect(parseHead('c72192623a4155ffa171f4ffb8bfcce7c40c2de9\n')).toBe('c72192623a4155ffa171f4ffb8bfcce7c40c2de9')
    expect(parseHead('')).toBeNull()
    expect(parseHead('  \n')).toBeNull()
  })
})

describe('parseBranch', () => {
  it('reports the attached branch, or nothing while detached', () => {
    expect(parseBranch('main\n')).toBe('main')
    expect(parseBranch('')).toBeNull()
  })
})

describe('assertRelativePath', () => {
  it('passes a work-tree-relative path through', () => {
    expect(assertRelativePath('a/b.ts')).toBe('a/b.ts')
    expect(assertRelativePath('a b/c d.ts')).toBe('a b/c d.ts')
  })

  it('rejects an empty, option-shaped, or escaping path', () => {
    expect(() => assertRelativePath('')).toThrow(/invalid relative path/)
    expect(() => assertRelativePath('-rf')).toThrow(/invalid relative path/)
    expect(() => assertRelativePath('../outside.ts')).toThrow(/invalid relative path/)
    expect(() => assertRelativePath('a/../b.ts')).toThrow(/invalid relative path/)
    expect(() => assertRelativePath('.git/config')).toThrow(/invalid relative path/)
  })
})
