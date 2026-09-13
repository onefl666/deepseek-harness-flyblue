---
description: "持久的 Windows shell 偏好：拥有 windows-shell settings 命名空间与启动期 DSH_WINDOWS_SHELL 播种；供在 Git Bash 与 PowerShell 栈之间做选择的用户与维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-windows-shell

[English](README.md) | 中文

## 概述

使用本包可持久化 Windows 下一次启动要挂载的 shell 栈。它拥有 `windows-shell` 用户设置命名空间（`shell: gitbash | pwsh`，默认 `gitbash`），并导出把存储偏好转换为 `DSH_WINDOWS_SHELL` 组合事实的启动期播种函数。Web GUI 用户通过 [Windows Shell 设置行](../../client/ui-windows-shell/README.zh.md)获得同等效果；本包是无头与配置侧的界面。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

[base bundle](../../bundle/base/cordis.patch.yml) 仅在 win32 挂载本包（`disabled: process.platform !== 'win32'`）；POSIX 宿主不提供 `windows-shell` 命名空间，这正是设置行在该侧隐藏的原因。

win32 上的优先级从高到低：显式设置的 `DSH_WINDOWS_SHELL` 变量（按次覆盖）、存储的 `shell: pwsh` 偏好、然后是 Git Bash 默认。只有存储偏好为 `pwsh` 时播种才写入——变量未设时本来就挂载 Git Bash。

`seedWindowsShellEnvironment(env?, filename?)` 读取设置文档（默认：harness home 下的 `settings.yaml`），按上述优先级播种 `env.DSH_WINDOWS_SHELL`。`dsh` 的 profile boot 在首次组合之前调用它。文档或节缺失不改变任何状态；文档损坏则指名文件地抛错。

该选择限定为重启生效（`applies: 'restart'`）：一个 host 只能挂载一个 shell 执行器，且会话的工具 roster 一旦开始输出即被锁定，因此存储值只改变下一次启动挂载的内容，绝不改变运行中的组合。

<a id="understand-the-implementation"></a>
## 理解实现

`src/settings.ts` 拥有 schema 与词汇常量；`src/boot.ts` 拥有播种函数；`src/index.ts` 在可选的 settings 服务组合后经 `ctx.inject(['settings'])` 注册命名空间。注册是插件 fiber 上的 effect，非法的存储节会在注册时响亮失败。

<a id="model-experience"></a>
## 模型体验

间接影响，经由下一次启动依据存储偏好挂载的 shell 执行器与工具行；它自身不注册任何 prompt 或 schema。

#### KV Cache 影响

没有直接的失效影响。更改偏好不会改变任何运行中会话的组装或前缀；下一次启动创建的会话依据那次启动挂载的栈建立自己的前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 启动播种在默认位置读取设置文档；以显式 `path` 配置挂载 `dsh-settings-file` 的部署必须显式设置 `DSH_WINDOWS_SHELL`。
- 超出两个栈的存储值不会让播种失败——settings provider 的注册在片刻之后就是 fail-loud 的裁决者。

<a id="dev-note"></a>
### 开发备注

无。

**运行时 invariant：**未发布 companion。该偏好只是 provider 在注册时解析的一个 settings 命名空间；启动播种是对单一文档的纯函数，由其矩阵测试证明——不存在可分歧的独立观察。
