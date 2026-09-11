# SSH hosts and execution

English | [中文](ssh.zh.md)

Host-owned SSH host records and one-shot remote command execution. `ctx.ssh` exposes loopback-only `list`, `put`, `delete`, and `exec` methods; the model-facing tools stay in [`dsh-tool-ssh`](../../packages/ssh/tool-ssh/README.md). Records live in `$DSH_HOME/dsh-ssh.json` with owner-only file and directory modes.

Source: [`packages/ssh/ssh/src/types.ts`](../../packages/ssh/ssh/src/types.ts)

## Host records

A stored host carries its credentials; every browser and model projection strips them.

```ts type-equiv
/** User-owned SSH host configuration. */
interface SshHost {
  id: SshHostId
  alias: string
  host: string
  port: number
  user: string
  password?: string
  privateKeyPath?: string
}
```

```ts type-equiv
/** Secret-free browser and model projection. */
type SshHostSummary = Omit<SshHost, 'password' | 'privateKeyPath'> & {
  auth: 'password' | 'key'
}
```

## Execution

`exec` dispatches one command at most once. A failure before dispatch rejects the call, so the command provably never ran. A connection loss or timeout after dispatch resolves with `result: "result-unknown"`: the caller learns the remote effect is uncertain and must not replay a non-idempotent command automatically.

## Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `connectTimeoutMs` | `15000` | Maximum connection-establishment time. |
| `execTimeoutMs` | `60000` | Maximum time for one dispatched command. |
| `outputLimitBytes` | `2097152` | Capture bound applied independently to stdout and stderr. |
| `idleTimeoutMs` | `1800000` | Reserved idle-connection lifetime. |
