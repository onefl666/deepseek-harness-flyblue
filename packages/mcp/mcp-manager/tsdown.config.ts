import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-mcp-manager',
  ['lib/types/index.js'],
  { hostPhase: true },
)
