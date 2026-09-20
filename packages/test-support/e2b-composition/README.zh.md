---
description: "one-world E2B 组合 fixture，用按键门控的 Loader 冒烟测试验证同一远程沙箱内的 FS、Bash、PTY 与 LSP。"
kind: "package-library"
---

# @deepseek-ai/dsh-e2b-composition

[English](README.md) | 中文

## 概述

`dsh-e2b-composition` 是 test-support 基础设施，拥有 one-world E2B 组合 e2e。它没有产品 API：[`src/index.ts`](src/index.ts) 是空模块，只为 fixture 提供自己的 workspace 依赖边，让 `dsh-fs-e2b` 与 `dsh-subprocess-e2b` 不再出现在共享的 `dsh-e2b` 包清单中。

测试通过 `runLoaderSmoke` 启动 [`tests/fixtures/composition/cordis.yml`](tests/fixtures/composition/cordis.yml)，验证 FS、Bash、PTY 与 LSP 共享同一个远程沙箱。所有用例都由 `E2B_API_KEY` 门控；没有密钥时套件自跳过。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

此包不会被产品代码导入。请把它作为 e2e fixture 的属主包运行：

```text
pnpm exec vitest run packages/test-support/e2b-composition
```

设置 `E2B_API_KEY` 以执行真实远程沙箱。没有该密钥时，Vitest 会把套件报告为跳过，而不是失败。

<a id="understand-the-implementation"></a>
## 理解实现

fixture 的 `cordis.yml` 会列出它加载的每个裸插件。其 `bin.ts` 通过真实 Cordis Loader 驱动 one-world 组合，并打印 e2e 断言的 JSON 报告。fixture 专用清单把这些插件列为 devDependencies，既让 `verify-cordis-config` 能证明每个配置行都有属主包，也让测试包不会给生产 E2B 图新增边。

<a id="further-exploration"></a>
## 延伸阅读

- [E2B provider family map](../../e2b/README.zh.md)——该 fixture 所验证的包家族。
- [Loader smoke helper](../loader-smoke/README.zh.md)——e2e 使用的子进程 harness。

<a id="model-experience"></a>
## 模型体验

None, as this is test infrastructure that registers no model context; the fixture exercises already-shipped plugins without adding model-visible behavior.

#### KV Cache effect

No direct invalidation: it contributes no request tokens and never mutates a request prefix, so provider cache reuse is unaffected.

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **需要真实的 E2B 密钥**——该包刻意不为实时远程世界断言提供无密钥替代。
- **仅作为 fixture 存在**——`src/index.ts` 是标记；该包不发布产品 API。
- **无 invariant companion**——No runtime invariant companion is published；该 fixture 只启动已发布插件，不拥有独立的生产事件流或可变数据。
- **平台中立的 runner 契约**——e2e 在每个 CI lane 上运行，但没有 `E2B_API_KEY` 时自跳过。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

该 fixture 之所以存在，是因为 `dsh-e2b` 必须 devDepend `dsh-fs-e2b` 与 `dsh-subprocess-e2b` 才能运行 one-world 冒烟测试，而这两个包又 peerDepend `dsh-e2b`。把 fixture 放到独立属主包，是保留该测试同时不引入 workspace 环的最小方式。

</details>
