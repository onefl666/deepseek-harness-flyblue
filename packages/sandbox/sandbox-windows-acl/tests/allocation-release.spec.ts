/**
 * Native-allocation accounting: every scratch block this package takes from
 * `koffi.alloc` — out-parameter slots, the OVERLAPPED handed to LockFileEx —
 * must come back through `koffi.free`, on the success path and on every failure
 * path. koffi.alloc is a bare calloc with no finalizer, so a missed release
 * stays in the owning process for its whole lifetime; the grant/revoke path
 * runs once per provision and once per session teardown.
 *
 * Win32-only, like the other suites that reach the real ACL bindings.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'

import { allocPtrSlot, decodePtr, freeNative, win32Sync } from '../src/ffi.ts'
import type { NativePtr, Win32Bindings } from '../src/ffi.ts'
import { AclWriteGrant } from '../src/index.ts'
import { grantWrite } from '../src/acl.ts'

const isWin32 = process.platform === 'win32'

// koffi.alloc/free are counted; every other koffi member resolves through the
// real module object, which ffi.ts reaches at module scope (`koffi.pointer`).
vi.mock('koffi', async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof import('koffi') }>()
  const real = actual.default
  const alloc = (...args: Parameters<typeof real.alloc>): unknown => real.alloc(...args) as unknown
  const free = (...args: Parameters<typeof real.free>): void => { real.free(...args) }
  return {
    default: Object.assign(Object.create(real) as typeof real, {
      alloc: vi.fn(alloc),
      free: vi.fn(free),
    }),
  }
})

/** The counted koffi surface, resolved through the mock above. */
async function countedKoffi(): Promise<{ alloc: Mock; free: Mock }> {
  const module: unknown = await import('koffi')
  return (module as { default: { alloc: Mock; free: Mock } }).default
}

/**
 * Run one operation and assert it released exactly the blocks it allocated.
 * @param operation - the native work under test.
 * @returns how many blocks the operation allocated.
 */
async function expectBalanced(operation: () => void): Promise<number> {
  const koffi = await countedKoffi()
  koffi.alloc.mockClear()
  koffi.free.mockClear()
  operation()
  const allocated: unknown[] = koffi.alloc.mock.results.map((result: { value: unknown }) => result.value)
  expect(allocated.length).toBeGreaterThan(0)
  const freed: unknown[] = koffi.free.mock.calls.map((call: unknown[]) => call[0])
  expect([...freed].sort()).toEqual([...allocated].sort())
  return allocated.length
}

/** One LocalAlloc'd SID owned by the spec, released by the caller. */
function scopedSid(api: Win32Bindings): NativePtr {
  const slot = allocPtrSlot()
  try {
    if (api.convertStringSidToSidW('S-1-4-9000-92', slot) === 0) throw new Error('ConvertStringSidToSidW failed')
    const sid = decodePtr(slot)
    if (sid === null) throw new Error('ConvertStringSidToSidW produced a null SID')
    return sid
  } finally {
    freeNative(slot)
  }
}

describe.skipIf(!isWin32)('native allocation release', () => {
  const scratchDirs: string[] = []
  afterEach(() => {
    for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  function scratch(): string {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-acl-alloc-'))
    scratchDirs.push(dir)
    return dir
  }

  it('releases every scratch block a granted and revoked path takes', async () => {
    const dir = scratch()
    const grant = AclWriteGrant.create('S-1-4-9000-91')
    // One OVERLAPPED for the per-path lock, five GetNamedSecurityInfoW
    // out-parameter slots, one SetEntriesInAclW slot.
    expect(await expectBalanced(() => { grant.add(dir) })).toBeGreaterThanOrEqual(6)
    expect(await expectBalanced(() => { grant.dispose() })).toBeGreaterThanOrEqual(6)
  })

  it('releases the scratch blocks of a failed DACL read', async () => {
    const api = win32Sync()
    const sid = scopedSid(api)
    try {
      let thrown: unknown
      const allocated = await expectBalanced(() => {
        try {
          grantWrite(api, join(scratch(), 'absent'), sid)
        } catch (error: unknown) {
          thrown = error
        }
      })
      expect(thrown).toBeInstanceOf(Error)
      expect((thrown as { api?: string }).api).toBe('GetNamedSecurityInfoW')
      // The lock OVERLAPPED and the five read slots were allocated before the
      // failing call; the failure path releases all of them.
      expect(allocated).toBe(6)
    } finally {
      api.localFree(sid)
    }
  })
})
