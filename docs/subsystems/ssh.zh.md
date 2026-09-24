# SSH 主机与执行

[English](ssh.md) | 中文

Host 侧拥有的 SSH 主机记录与一次性远程命令执行。`ctx.sshHosts` 暴露仅限环回的 `list`、`put`、`delete` 与 `exec` 方法；面向模型的工具保留在 [`dsh-tool-ssh`](../../packages/ssh/tool-ssh/README.zh.md)。记录存放在 `$DSH_HOME/dsh-ssh.json`，文件与目录权限仅限属主。

Source: [`packages/ssh/ssh-hosts/src/types.ts`](../../packages/ssh/ssh-hosts/src/types.ts)

## 主机记录

存储的主机携带其凭据；每个浏览器与模型投影都会剥除它们。

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

## 执行

`exec` 对一条命令至多派发一次。派发前的失败会拒绝该调用，因此可证明命令从未执行。派发后连接中断或超时则以 `result: "result-unknown"` 返回：调用方得知远端效果不确定，绝不能自动重放非幂等命令。

## 配置

| 键 | 默认值 | 含义 |
| --- | --- | --- |
| `connectTimeoutMs` | `15000` | 建立连接的最长时间。 |
| `execTimeoutMs` | `60000` | 一条已派发命令的最长耗时。 |
| `outputLimitBytes` | `2097152` | 分别施加于 stdout 与 stderr 的捕获上限。 |
| `idleTimeoutMs` | `1800000` | 预留的空闲连接生命周期。 |
