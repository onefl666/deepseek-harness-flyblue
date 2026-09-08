---
description: "基于内置 CodeGraph 引擎的语义代码索引工具与 Web host 索引生命周期；面向 CodeGraph 子系统的使用者与维护者。"
kind: "package-group"
---

# codegraph/：语义代码索引工具

[English](README.md) | 中文

## 概述


面向模型的 CodeGraph 工具，以及 Web host 索引生命周期，基于发行版附带的 `@colbymchenry/codegraph` 引擎。没有可替换的提供方约定：工具打开项目本地的 `.codegraph/` 索引。

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`tool-codegraph/`](tool-codegraph/README.zh.md) | 在 `ctx.tools` 上注册 `codegraph_explore`（以及可选的额外工具）。 | （注册到 `ctx.tools`） |
| [`codegraph-index/`](codegraph-index/README.zh.md) | Web host 索引生命周期：状态、用户 init、可选自动 init。 | `codegraphIndex` |
| [`command-codegraph-init/`](command-codegraph-init/README.zh.md) | 基于 `ctx.codegraphIndex` 的用户 `/codegraph-init` 命令。 | （注册到 `ctx.commands`） |

子级 README 负责工具、提示词和引擎隔离约定。索引管理器在 host 平面，不是模型工具。

-----

<a id="related-documentation"></a>
## 相关文档

- [CodeGraph 子系统参考](../../docs/subsystems/codegraph.zh.md) —— 索引生命周期、探索工具与引擎隔离边界。


<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

None.

</details>
