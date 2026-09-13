---
description: "Web GUI 的 Windows shell 偏好设置行（Git Bash 与 PowerShell）；写入供下一次启动组合的 windows-shell 命名空间；供 win32 shell 栈的用户与维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-windows-shell

[English](README.md) | 中文

## 概述

使用本包可在 Web GUI 中切换 Windows shell 栈。通用设置行经宿主 Settings API 写入持久的 `windows-shell` 命名空间；下一次启动挂载所选栈（默认 Git Bash，一次点击切到 PowerShell）。行文案明示重启范围，因为运行中的组合无法更换其 shell 执行器。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

将本插件与 settings 各包一同挂载（[web-app bundle](../../bundle/web-app/cordis.patch.yml) 已内置），该行随即出现在提供 `windows-shell` 命名空间的宿主的通用设置中。POSIX 宿主不挂载该命名空间，行自动隐藏；禁用了宿主持久化的远程（非回环）浏览器同样隐藏。

<a id="understand-the-implementation"></a>
## 理解实现

`src/client/settings-store.ts` 镜像共享 settings describe 视图，并携带视图 revision 写入 `shell` 字段；被接受的答案回折进 mirror。`src/client/WindowsShellRow.tsx` 基于 `Menu` 原语渲染该行，提供两个封闭词汇的选项。公告值超出两个栈时，行会响亮失败，而不是渲染一个无法指名当前值的选择器。

<a id="model-experience"></a>
## 模型体验

间接影响，经由该行写入后下一次启动挂载的 shell 栈；该行自身不注册任何 prompt 或 schema。

#### KV Cache 影响

没有直接的失效影响。该写入不会改变任何运行中会话的组装或前缀；下一次启动创建的会话依据那次启动挂载的栈建立自己的前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 该行无法切换运行中的组合；优先级与重启语义归宿主包的 README 所有。
- 可选项 id 在客户端重述：import 宿主包会把 `node:fs`/`yaml` 带进浏览器 bundle。

<a id="dev-note"></a>
### 开发备注

无。

**运行时 invariant：**未发布 companion。仅浏览器侧的控制器经共享 settings mirror 写入，HMR 安全测试证明该行的贡献生命周期。
