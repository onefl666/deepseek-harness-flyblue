---
description: "通过 skillManager Remote 管理技能目录：列出、安装、编辑、卸载，以及启用或关闭用户与项目作用域拥有的技能，并附带驱动它的「技能」设置分区。"
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-manager

[English](README.md) | 中文

## 概述

用本包在 Web GUI 中管理技能，而不必手工编辑目录。它读取 `dsh-skill-filesystem` 所发现的同四个根目录，把新技能写入该作用域共享的 agent 根目录，并把启用状态表达为位置：被关闭的技能会移入根目录内的禁用区，而提供方的深度一层发现永远不会进入该目录。每次改动都落盘，因此提供方自己的 watcher 会发布变更，无需重启。宿主半边提供 `skillManager` Remote；浏览器半边渲染「技能」设置分区。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把本包挂在它所写入的 tools 能力旁边。宿主半边注册 `skillManager` Remote 命名空间；浏览器半边注册一个设置分区。

```yaml
- name: '@deepseek-ai/dsh-skill-manager'
```

每次 Remote 调用都携带作用域 —— `{ kind: 'user' }` 或 `{ kind: 'workspace', cwd }` —— 并返回该作用域刷新后的清单，因此客户端不会去预测文件系统结果：

| 方法 | 作用 |
|---|---|
| `list` | 根目录、新建目标，以及找到的全部技能（按名称排序） |
| `read` | 某个技能已存储的文档，拆分为 frontmatter 与正文 |
| `create` | 在该作用域共享的 agent 根目录下撰写新技能 |
| `installFromDirectory` | 把一个已有技能目录复制进该根目录 |
| `installFromGit` | 浅克隆仓库并复制其中携带的技能 |
| `update` | 重写所拥有的 frontmatter 字段与正文 |
| `uninstall` | 删除一个可管理的技能 |
| `setEnabled` | 在技能根目录与根目录的禁用区之间移动 |

可管理的根目录为：用户作用域的 `$DSH_HOME/skills` 与 `$DSH_AGENTS_HOME/skills`，以及工作区作用域的 `<项目>/.dsh/skills` 与 `<项目>/.agents/skills`，其中项目根是最靠近的含 `.git` 的祖先目录。新技能写入 `.agents/skills` 根目录。在其他任何位置找到的技能 —— 内置提供方、预设自带的目录 —— 都以 `managed: false` 列出，并拒绝一切改动。

### 失败

每种拒绝都带有稳定错误码：`skill-manager/not-found`、`skill-manager/conflict`、`skill-manager/read-only`，或带可执行原因的 `skill-manager/rejected`。frontmatter 未声明可用技能的条目会从清单中跳过，而不会让清单失败。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节 —— 点击展开</summary>

- **管理器拥有的是目录，而不是注册表。** 它从不调用 `ctx.skills`；它读写提供方所扫描的根目录，这使两者不会漂移，也让部署可以在不关闭管理能力的前提下禁用宿主 plane 的 `skill-filesystem` 行。
- **启用状态就是一次重命名。** `discoverRoot` 只检查深度一层条目，因此 `<根>/.disabled/<名称>/SKILL.md` 不可见；重命名发生在同一文件系统上，因而要么全成要么全败，它产生的 `unlinkDir`/`addDir` 事件也正是提供方 watcher 早已视为目录变更的那两类。
- **项目根规则只有一个归属。** `resolveProjectRoot` 由 `dsh-skill-filesystem` 导出并在此调用，因此工作区作用域不可能解析出与发现逻辑不同的项目。
- **作用域的回答只属于自己。** 每次改动都返回刷新后的清单而不是差异，因此浏览器每次操作只应用一个由服务端给出的值。

</details>

<a id="further-exploration"></a>
## 进一步探索

- [技能子系统参考](../../../docs/subsystems/skills.zh.md) —— 本包围绕其工作的注册表、提供方契约与本地发现优先级。
- [本地文件系统技能提供方](../skill-filesystem/README.zh.md) —— 本包的根目录与禁用区所针对的发现逻辑。
- [Remote 组装](../../api/remotes/README.zh.md) —— 客户端如何在不导入宿主实现的前提下使用 `skillManager`。

-----

<a id="model-experience"></a>
## 模型体验

### 管理改动

#### 模型看到什么

本包不注册任何工具、提示词分区或请求上下文贡献。它的影响是间接且有意为之的 —— 在此启用或关闭技能，会改变 `skill` 工具与每会话目录在下次读取时所宣告的内容。

#### Token 影响

本包自身不增加请求 token；可见的每一个字节都由上述消费者负责。

#### KV Cache 影响

无；本包既不组装也不发送 provider 请求。启用或关闭技能会改变会话下一次发布的工具目录，那是 `dsh-tool-skill` 拥有的会话日志事件。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **随部署发布的技能是只读的** —— 位于内置根目录或预设自带 `skills/` 目录下的技能会带来源标签列出，但无法移动或删除，因为管理器只在自己拥有的根目录内重命名。
- **工作区作用域需要项目目录** —— 没有注册工作区的部署只能管理用户级技能。
- **Git 安装需要 `git` 可执行文件** —— 安装路径会调用它；没有 git 的机器会返回带克隆失败原因的 `skill-manager/rejected`，而不是降级处理。
- **编辑不会保留 frontmatter 的排版** —— `update` 会保留未知键，但不会保留它们的注释与布局。

<a id="dev-note"></a>
### 开发备注

禁用区是管理器自有的一套约定，位于每个技能根目录内部，而不是提供方的功能：提供方不受本包影响，停放在那里的技能只是一个它从不检查的深度二条目。
