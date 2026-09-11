# Agent Note: Resolve the model directory through the providing context

Status: implemented

English | [中文](2026-09-08-model-directory-resolution-provider-context.zh.md)

## Problem

The `conversation.input.model` seat failed whenever the registering plugin did not itself inject `remote.session`. [`ModelDirectoryResolver.directoryFor()`](../../../../packages/client/ui-model-selection/src/client/service.ts) read `this.ctx`, and cordis rebinds a service method's `ctx` to the **caller**: `getTraceable` installs a shadow whose prototype is the caller's context, so `this.ctx.remote.session` walks the caller's fiber chain. Inject resolution is not chain-based — `Fiber._checkImpl` reads the global service store — so the two disagree, and only a caller whose chain passes through a fiber declaring `remote.session` can read the namespace property.

The api-gateway provides each Remote namespace from its own fiber (`ownerCtx.plugin({ name: remoteServiceKey(name), … })` in [`packages/api/gateway/src/client/index.ts`](../../../../packages/api/gateway/src/client/index.ts)), a sibling of every other plugin. A plugin that overrides the seat with `inject: ['slots', 'sessions', 'modelDirectories', 'timer', 'locale']` therefore reached `cannot get property "remote.session" without inject`, and `SlotErrorBoundary` swallowed the seat instead of rendering the model picker.

## Decision

`ModelDirectoryResolver` captures its providing context in the constructor (`this.owner = ctx`) and reads `sessions`, `remote.session`, and the optional `conversation` through it. `static inject = ['sessions', 'remote', 'remote.session']` is unchanged: the service still declares what its own fiber needs, and the resolution no longer depends on who calls it. `ModelCatalogDirectory` already read its constructor context this way, so the class now has one context discipline.

Failure semantics are unchanged: an unknown session still throws `resolved no scope` or `resolved no binding`, and the namespace face still comes from the fiber that provides it. A namespace remount still reloads the plugin through the fiber epoch, so no stale reference is retained.

[The browser-half spec](../../../../packages/client/ui-model-selection/tests/browser-plugin.client.spec.ts) reproduces the shipped topology: `remote.session` is provided by a sibling fiber, and `ctx.remote` is a tracked cordis `Service` — the test double alone registers a plain object, whose `.session` would be an ordinary property read that never consults the chain. The regression case resolves a directory from a consumer fiber that injects only `modelDirectories`; on the pre-fix code it fails with the production message `cannot get property "remote.session" without inject`.

## Alternatives considered

**Declare `remote.session` in the overriding plugin.** Rejected: that plugin never reads the namespace. A dead injection would spread the service's topology assumption into its consumers and would not help any other consumer of `directoryFor()`.

**Read `ctx.get('remote.session')`.** This works — the global store returns the same face — but it drops the declared-injection type at the read site and diverges from the class's other reads. Capturing the owner context keeps the typed property access and makes it caller-independent at the same time.

**Provide the namespace on the composition root.** Rejected: each namespace fiber owns its method installation and disposal. Hoisting the service to the root would change namespace lifecycle to hide a resolution defect rather than remove it.

## Consequences

Any consumer may call `ctx.modelDirectories.directoryFor()` without declaring `remote.session`; the [package README](../../../../packages/client/ui-model-selection/README.md) states that contract. The owner context dies with the service's own fiber, matching the lifetime the `catalog` reads already had, and the directory map is still cleaned up by the session scope's disposer.
