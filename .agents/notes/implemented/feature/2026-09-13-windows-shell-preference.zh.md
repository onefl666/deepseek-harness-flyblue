# Agent Note: Windows shell 偏好——一个 settings 命名空间与设置行，在下次启动时播种 DSH_WINDOWS_SHELL

Status: implemented

[English](2026-09-13-windows-shell-preference.md) | 中文

## 问题

自 [gitbash 栈笔记](2026-09-12-gitbash-windows-shell-stack.zh.md)以来，win32 shell 栈只能通过 `DSH_WINDOWS_SHELL` 环境变量（按次生效）或 profile patch（持久）选择。不存在持久且可发现的开关：Web GUI 没有任何界面，手工编辑 `cordis.patch.yml` 是唯一的持久通道。

## 决策

- 新宿主包 `@deepseek-ai/dsh-windows-shell` 拥有该持久偏好：settings 命名空间 `windows-shell`（`shell: 'gitbash' | 'pwsh'`，默认 `gitbash`），以 `applies: 'restart'` 注册，由 base bundle 仅在 win32 挂载（`process.platform !== 'win32'` 禁用该行）。
- `runProfile`（apps/cli/src/profile-boot.ts）在首次 compose 之前调用 `seedWindowsShellEnvironment()`：读取 `<harness home>/settings.yaml`，仅当存储偏好为 pwsh 且变量未设时播种 `process.env.DSH_WINDOWS_SHELL = 'pwsh'`。显式设置的变量保持其按次覆盖（与 `DSH_PERMISSION_MODE ?? 'workspace-write'` 同一优先级惯例）；文档或节缺失则维持 Git Bash 默认；文档损坏则指名文件地失败。
- 任何 `disabled:` 表达式都没有改动。播种填充的是既有门控行已经在消费的唯一组合期事实通道；vendored loader 的 `with(ctx){eval}` 回落到真实 `process`，把它同时带给 bundle 行与 preset 行。
- 设计上限定为重启生效：一个 host 只能挂载一个 shell 执行器（重复服务注册会抛错），且会话的工具 roster 一旦开始输出即被锁定（agent-preset 的 `recompose` 契约），因此运行中切换无法兑现。设置行的文案明示了重启范围。
- 新客户端包 `@deepseek-ai/dsh-client-ui-windows-shell` 在通用设置中添加该行（slot id `windows-shell`，order 1），构建在共享 settings describe mirror 之上：两个固定选项、带 revision 栅栏的 `remote.settings.mutate`（答案回折进 mirror），命名空间缺失（POSIX 宿主）或持久化被禁用（非回环 memory 模式）时隐藏，公告值超出两个栈时显式失败。
- 行的可选项 id 是有意在客户端重述的封闭产品词汇：把宿主包 import 进浏览器 bundle 会带入 `node:fs`/`yaml`，而从 wire schema 派生选项会为这个不新增执行器包就不会增长的枚举克隆 `permissionDefaultOf` 的机制。

## 考虑过的替代方案

- **即时切换（改 env 并重组合）**——需要整树与 preset 作用域的重组合，对任何运行中的会话都不安全（roster 锁定）；否决。重启生效与它替代的 env 变量通道一致——后者同样需要重启。
- **设置行之外的 `/shell` 斜杠命令**——本次变更被 owner 否决；设置行是唯一界面。
- **从 schema 派生行选项**——在枚举可由宿主配置时是正确模式（权限预设）；此处没有会变化的输入，否决。
- **让 `!!js disabled` 表达式直接读 settings 文档**——表达式必须保持廉价与纯粹，且这会让 loader 耦合 settings 格式；否决，改用 env 播种。

## 后果

- win32 上的优先级：显式 `DSH_WINDOWS_SHELL` > 存储的 `windows-shell.shell` > Git Bash 默认。
- 以显式 `path` 配置挂载的 settings-file provider 会绕过启动播种（播种读取默认的 `<harness home>/settings.yaml` 位置）；此类部署需显式设置环境变量。已在包 README 说明。
- 播种对超出两个栈的存储值有意宽容（provider 的注册在片刻之后就是 fail-loud 的裁决者），对损坏的 YAML 则 fail-loud。
- `packages/bundle/base/tests/base.spec.ts` 在同一变更中修复：自 `5604f88834` 起它就用不带 env 的作用域 `process` 求值 shell 行（`TypeError: Cannot read properties of undefined (reading 'DSH_WINDOWS_SHELL')`），且其期望表早于 Git Bash 默认。现在它为全部 shell 行及新增偏好行固定 platform × env 真值。
- 无会话事件、模型可见输入或工具文案变化，故未添加录制会话快照（与 gitbash 栈笔记同判）；roster 事实由 `windows-shell.spec.ts` 与 `base.spec.ts` 固定。
