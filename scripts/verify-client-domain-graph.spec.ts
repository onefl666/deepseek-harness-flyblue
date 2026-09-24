import { describe, expect, it } from 'vitest'
import { clientDomain, isClientAssembly, resolveClientImport } from './verify-client-domain-graph.ts'

describe('client domain import resolution', () => {
  it('preserves imports that leave src/client from a top-level file', () => {
    expect(resolveClientImport('styles.ts', '../styles/base.css?inline'))
      .toBe('../styles/base.css?inline')
  })

  it('normalizes imports between domains inside src/client', () => {
    expect(resolveClientImport('input/hub.ts', '../queue/store.ts'))
      .toBe('queue/store.ts')
  })

  it('treats integrated presentation folders as one domain without grouping unrelated folders', () => {
    expect(clientDomain('ui-sidebar-browser', 'browser/BrowserPage.ts')).toBe(clientDomain('ui-sidebar-browser', 'view/BrowserBody.tsx'))
    expect(clientDomain('ui-sidebar-documentpreview', 'pdf/index.ts')).toBe(clientDomain('ui-sidebar-documentpreview', 'zoom/store.ts'))
    expect(clientDomain('ui-conversation', 'skeleton/InputBar.tsx')).toBe(clientDomain('ui-conversation', 'input/editor/DraftEditor.tsx'))
    expect(clientDomain('ui-conversation', 'queue/store.ts')).not.toBe(clientDomain('ui-conversation', 'input/editor/DraftEditor.tsx'))
    expect(clientDomain('ui-workspace', 'session-actions/ArchiveSession.tsx')).toBe(clientDomain('ui-workspace', 'rows/Rows.tsx'))
  })

  it('recognizes only the integrated packages explicit assembly files', () => {
    expect(isClientAssembly('ui-sidebar-browser', 'pages.ts')).toBe(true)
    expect(isClientAssembly('ui-sidebar-documentpreview', 'TextPreview.tsx')).toBe(true)
    expect(isClientAssembly('ui-sidebar-documentpreview', 'face.ts')).toBe(true)
    expect(isClientAssembly('ui-sidebar-documentpreview', 'store.ts')).toBe(true)
    expect(isClientAssembly('ui-conversation', 'settings.ts')).toBe(false)
  })
})
