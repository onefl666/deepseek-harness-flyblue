import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const packageRoot = resolve(import.meta.dirname, '..')
const bundlePath = join(packageRoot, 'lib/client.js')
const require = createRequire(import.meta.url)
const licenseNames = [
  'LICENSE',
  'cmaps/LICENSE',
  'standard_fonts/LICENSE_FOXIT',
  'standard_fonts/LICENSE_LIBERATION',
  'wasm/LICENSE_JBIG2',
  'wasm/LICENSE_OPENJPEG',
  'wasm/LICENSE_PDFJS_JBIG2',
  'wasm/LICENSE_PDFJS_OPENJPEG',
  'wasm/LICENSE_PDFJS_QCMS',
  'wasm/LICENSE_QCMS',
] as const

function run(command: string, args: string[], cwd: string, timeout: number, shell = false): string {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout, shell })
  expect(result.error).toBeUndefined()
  expect(result.signal, result.stderr).toBeNull()
  expect(result.status, result.stderr).toBe(0)
  return result.stdout
}

function runPnpm(args: string[], cwd: string, timeout: number): string {
  const entrypoint = process.env.npm_execpath
  if (entrypoint === undefined || entrypoint === '') {
    // A runner launched outside a package script (a bare `pnpm exec vitest`)
    // carries no lifecycle entrypoint, so the PATH shim is all that is left —
    // and on Windows that shim is a `.cmd` file, which only a shell can run.
    return run('pnpm', args, cwd, timeout, process.platform === 'win32')
  }
  return /\.[cm]?js$/iu.test(entrypoint)
    ? run(process.execPath, [entrypoint, ...args], cwd, timeout)
    : run(entrypoint, args, cwd, timeout)
}

describe('published PDF.js licenses', () => {
  it.skipIf(!existsSync(bundlePath))('keeps every bundled license in the packed client artifact', ({ task }) => {
    const output = mkdtempSync(join(tmpdir(), 'dsh-document-preview-pack-'))
    try {
      const packed = JSON.parse(runPnpm([
        'pack', '--json', '--pack-destination', output,
      ], packageRoot, task.timeout)) as { filename: string; files: { path: string }[] }
      expect(packed.files.map(file => file.path)).toContain('lib/client.js')
      expect(packed.files.some(file => file.path.endsWith('pdfjs-NOTICES.txt'))).toBe(false)

      // The packed bundle is the built one: packing copies files, it does not
      // rewrite them, so the licenses are asserted on the artifact the pack
      // step just listed. Reading the tarball instead would need a tar whose
      // flags differ between the GNU and BSD implementations.
      const client = readFileSync(bundlePath, 'utf8')
      expect(client).toContain('//! Bundled PDF.js license notices')
      const pdfRoot = dirname(require.resolve('pdfjs-dist/package.json'))
      for (const name of licenseNames) {
        const source = readFileSync(join(pdfRoot, name), 'utf8').trimEnd()
        const commented = [`// ${name}`, '// ', ...source.split('\n').map(line => `// ${line}`)].join('\n')
        expect(client, `${name} must be visible in package/lib/client.js`).toContain(commented)
      }
    } finally {
      rmSync(output, { recursive: true, force: true })
    }
  })
})
