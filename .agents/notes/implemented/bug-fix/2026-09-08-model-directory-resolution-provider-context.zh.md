# Agent Note：通过提供方上下文解析模型目录

Status: implemented

[English](2026-09-08-model-directory-resolution-provider-context.md) | 中文

## Problem

只要注册插槽的插件自身没有注入 `remote.session`，`conversation.input.model` 插槽就会失败。[`ModelDirectoryResolver.directoryFor()`](../../../../packages/client/ui-model-selection/src/client/service.ts) 读的是 `this.ctx`，而 cordis 会把服务方法的 `ctx` 重绑到**调用方**：`getTraceable` 安装的 shadow 以调用方上下文为原型，因此 `this.ctx.remote.session` 沿调用方的 fiber 链向上查找。注入解析并不按链进行——`Fiber._checkImpl` 读的是全局服务表——两者由此不一致，只有链上恰好经过某个声明了 `remote.session` 的 fiber 的调用方才能读到该命名空间属性。

api-gateway 在自己的 fiber 中提供每个 Remote 命名空间（[`packages/api/gateway/src/client/index.ts`](../../../../packages/api/gateway/src/client/index.ts) 中的 `ownerCtx.plugin({ name: remoteServiceKey(name), … })`），该 fiber 与其他所有插件是兄弟关系。因此，以 `inject: ['slots', 'sessions', 'modelDirectories', 'timer', 'locale']` 覆盖该插槽的插件会走到 `cannot get property "remote.session" without inject`，`SlotErrorBoundary` 随即吞掉插槽，模型选择器不再渲染。

## Decision

`ModelDirectoryResolver` 在构造函数中捕获自身所属上下文（`this.owner = ctx`），并通过它读取 `sessions`、`remote.session` 以及可选的 `conversation`。`static inject = ['sessions', 'remote', 'remote.session']` 保持不变：服务仍声明自身 fiber 所需的服务，而解析不再取决于调用者是谁。`ModelCatalogDirectory` 早已按这种方式读取构造函数上下文，该类现在只有一种上下文纪律。

失败语义不变：未知会话仍抛 `resolved no scope` 或 `resolved no binding`，命名空间面仍来自提供它的 fiber。命名空间重挂仍由 fiber epoch 触发插件重载，因此不会留下陈旧引用。

[浏览器半侧 spec](../../../../packages/client/ui-model-selection/tests/browser-plugin.client.spec.ts) 复刻了真实拓扑：`remote.session` 由兄弟 fiber 提供，`ctx.remote` 是带 cordis tracker 的 `Service`——测试替身本身注册的是普通对象，其 `.session` 只是一次普通属性读取，不会查询调用链。回归用例从一个只注入 `modelDirectories` 的消费方 fiber 解析目录；在修复前的代码上，它以生产环境的原始报错 `cannot get property "remote.session" without inject` 失败。

## Alternatives considered

**在覆盖插件里声明 `remote.session`。** 否决：该插件从不读取这个命名空间。一条无用注入会把服务的拓扑假设扩散到它的消费方，也帮不到 `directoryFor()` 的任何其他消费方。

**改读 `ctx.get('remote.session')`。** 可行——全局表返回同一个面——但它在读取点丢掉了已声明注入的类型，也偏离了该类其他读取的写法。捕获所属上下文既保留了带类型的属性访问，又让它与调用方无关。

**把命名空间提供在组合根上。** 否决：每个命名空间 fiber 拥有自己的方法安装与释放。把服务提到根上是以改变命名空间生命周期来掩盖解析缺陷，而不是消除它。

## Consequences

任何消费方都可以调用 `ctx.modelDirectories.directoryFor()` 而不必声明 `remote.session`；[包 README](../../../../packages/client/ui-model-selection/README.zh.md) 写明了这一契约。所属上下文随服务自身 fiber 消亡，与 `catalog` 读取本就具有的生命周期一致，目录映射仍由会话作用域的 disposer 清理。
