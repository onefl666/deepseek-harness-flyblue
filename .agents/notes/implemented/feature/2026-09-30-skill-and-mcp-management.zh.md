# Agent Note: Built-in skill and MCP server management

Status: implemented

[English](2026-09-30-skill-and-mcp-management.md) | 中文

## Problem

Web GUI 没有提供用户最需要调整的两件事的入口：安装了哪些技能，以及它连接哪些 MCP 服务器。技能此前只能手工编辑 `$DSH_HOME/skills` 或项目 `.agents/skills` 下的目录，而启用状态除了技能自身 frontmatter 里的 `disable-model-invocation` 之外毫无表达方式。MCP 服务器此前只能把一条 `mcp-client` 行写进 `cordis.yml` patch 层并重启才能添加。`dsh-mcp-client` 不暴露任何连接状态，因此无法显示某条已声明的服务器究竟是否在运行。

## Decision

新增两个包，各自包含 Host 半边与浏览器半边，且都在随附的 Web profile 中启用：`@deepseek-ai/dsh-skill-manager` 与 `@deepseek-ai/dsh-mcp-manager`。每个包注册一个 `settings.section`（`技能`，order 30；`MCP 服务器`，order 35），并各自拥有一个 Typert Remote 命名空间（`skillManager`、`mcpManager`）。浏览器半边各自注入对应的 `remote.<namespace>` 服务，而该服务只有 `dsh-api-remotes` 客户端装配通过 import 并 `$mount` 两个生成的 contribution 才会提供；挂载清单漏掉一个命名空间，浏览器入口就会在启动时挂起。

**技能：管理器拥有的是目录，而不是注册表。** 它读取 `dsh-skill-filesystem` 所发现的同四个根目录，把新技能写入该作用域共享的 `.agents/skills` 根目录，并把启用状态表达为位置：被关闭的技能会移入根目录内的 `.disabled/` 区域。提供方只检查深度一层条目，因此被停放的技能不可见，而这次重命名产生的 `unlinkDir`/`addDir` 事件正是提供方 watcher 早已视为目录变更的那两类 —— 这也是为什么每次改动都即时生效，而无需触碰 `SkillRegistry` 或任何核心包。`resolveProjectRoot` 由 `dsh-skill-filesystem` 导出，使工作区作用域不可能解析出与发现逻辑不同的项目。

**MCP：每条存储记录一个挂载。** 管理器按作用域各保留一份 JSON 注册表，并为每条已启用记录在自己拥有的子 fiber 中挂载一个 `dsh-mcp-client` 实例 —— 这正是 `dsh-acp` 已经使用的形态。`list` 先调和再作答，因此在 GUI 之外编辑过的定义会在下次读取时收敛。已声明的 `cordis.yml` 行会被列出，并通过 `Entry.update({ disabled })` 切换，而 Cordis 只在**内存**中应用它 —— 只有 `EntryTree.create/remove/move` 会把配置写回文件 —— 因此所在文件始终是权威，任何 GUI 操作都不会改写用户配置。命名空间的删除动词是 `uninstall` 而不是 `remove`：客户端命名空间服务会拒绝与自身接口冲突的线上方法（`remove` 是 Cordis 服务的生命周期成员），冲突会让挂载在激活时抛错，因此该动词沿用 `skill-manager` 的命名。

**`dsh-mcp-client` 获得三项能力**：面向迁移期服务器的 `sse` 传输；`minProtocolVersion`，即对照服务器 `initialize` 应答版本检查的下限（通过观察有文档记载的应答获得，因为 SDK 硬编码自身版本且不暴露访问器）；以及每个实例在连接、断开、放弃与释放时都会发出的 `mcp/status` 事件，由管理器缓存并经转发事件白名单送达浏览器。

只提升了一个原语而不是第三次复制：`ui-primitives` 中的 `SearchField`。其余一概不共享 —— 两个页面的行、store 与 RPC 面各不相同。

动效遵循仓库的可打断动画规则：每个可重定向的状态（悬停、消失、清除控件、作用域选择器）都是持久元素上的 CSS `transition`，因此反向操作会从当前计算值继续；`@keyframes` 只用于错落入场与骨架脉冲，且每个页面都带一条覆盖其子树的 `prefers-reduced-motion` 守卫。

## Alternatives considered

- **单一共享的「管理器列表」原语或包。** 否决：两个页面在行内容上不同（技能来源与启用状态，对比连接状态、传输与目标），而仓库已有记录：第二个消费者应把原子组件提升进 `ui-primitives`，而不是把页面骨架提升为新包。
- **用 rank 0 的影子技能提供方压制被关闭的名称。** 否决：注册表对重名先按最近层解析，而随附的 Web profile 把 `skill-filesystem` 挂载在每个预设的常驻作用域内，因此宿主平面的影子无法压制预设层的技能。移动目录在所有层都有效，且无需修改服务定义。
- **通过改写用户 patch 层来持久化 MCP 启用状态。** 否决：那样 GUI 开关会重新格式化用户拥有的 YAML 文件，而声明状态会有两个归属。
- **钉定协商出的 MCP 协议版本。** 不可能：SDK 在 `initialize` 请求里发送 `LATEST_PROTOCOL_VERSION` 并私下保留应答，因此该字段诚实地表达为下限而非钉定。
- **四个包（拆分宿主与客户端）。** 否决，改用 `@deepseek-ai/dsh-api-session-controller` 已经证明的双面形态，并把两个新名称加入依赖策略的 `clientFaceExclude` —— 与那个包使用同一机制 —— 因为它们的 Host 半边确实有运行时依赖。

## Consequences

- GUI 开关永不改写用户配置；已声明 MCP 行的切换只作用于本进程，重启会恢复文件所声明的状态，页面也如实说明这一点。
- 技能启用状态在磁盘上以目录位置可见，因此在宿主未运行时依然保留，并且对检查目录树的用户可读。
- 工作区作用域的 MCP 服务器按项目存储与切换，但把工具注册到宿主平面，因此只要它在运行，对所有会话可见。真正的按会话隔离需要目前尚不存在的 agent 生命周期钩子；README 把它记为已知限制，而不是隐藏它。
- `clientFaceExclude` 现在命名四个包，因此它们的清单不在依赖门禁的覆盖范围内。这是双面形态的代价，并在 pull request 中明确说明。
