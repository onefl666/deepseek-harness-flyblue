# Agent Note: Win32 原生分配与句柄生命周期

Status: implemented

[English](2026-09-19-win32-native-resource-lifetime.md) | 中文

## 问题

`dsh` CLI 宿主进程在 Windows 上以 `0xC0000409`（`STATUS_STACK_BUFFER_OVERRUN`，Windows 用于 fail-fast 中止的代码）死亡，pnpm 只报出 `ELIFECYCLE`。进程没有留下任何其它东西：没有 stderr 行、没有 Windows 错误报告条目、没有诊断报告。崩溃是概率性的，且与长时间运行的会话相关——这正是逐步资源耗尽、或对从来不属于该堆的内存执行堆操作的典型画像。

对宿主进程内每一处 `koffi` 分配的静态审计发现了两个同类现网缺陷。

`@deepseek-ai/dsh-subprocess-local` 的 [windows-inspector.ts](../../../../packages/subprocess/subprocess-local/src/windows-inspector.ts) 每次枚举进程表取一个 `PROCESSENTRY32W`（568 字节），每次存活询问取 4 个 `FILETIME` 槽（32 字节），二者都不归还。`koffi.alloc` 是裸 `calloc` 且没有 finalizer，因此这些块会在宿主里留到进程结束；终端在 Windows 上的 teardown 在会话关闭期间每 25 ms 轮询一次存活，于是关闭一棵 100 进程的树在一次终端关闭中约耗费 0.7 MB 且永不回收。在本机测得：单次 `WindowsProcessInspector.snapshot().tree(pid)` 循环会让 RSS 每次迭代增长 613–664 字节且无上界；修复后同一循环持平。

`@deepseek-ai/dsh-sandbox-windows-acl` 在三个尺度上有同样的形态：每次 DACL 读取 5 个指针出参槽、每次 `SetEntriesInAclW` 合并 1 个、每个路径锁 32 字节的 `OVERLAPPED`，另有若干 token 形态的槽。其 `AclSandbox.spawn` 只在 `wait()` 内关闭 kill-on-close Job，于是「生成了子进程却从未 wait」或「`waitForExit` 抛错」的调用方会泄漏 Job 句柄，更糟的是让 `KILL_ON_JOB_CLOSE` 永远无法触发。两个 `drainPipe` 都是立即启动且没有 rejection 处理，因此无人等待的子进程会把管道失败报成进程级 unhandled rejection，而不是通过 `wait()` 报告。

## 决策

每一个 `koffi.alloc` 块在离开创建它的作用域的所有路径上，都由恰好一次 `koffi.free` 归还；而关闭该块所服务的 Win32 句柄的那个 `finally`，就是归还它的地方。[ffi.ts](../../../../packages/sandbox/sandbox-windows-acl/src/ffi.ts) 导出 `freeNative` 供 sandbox 包使用；subprocess inspector 直接调用 `koffi.free`。这种配对是可断言的单元级不变量，而不是一句注释：[windows-inspector.spec.ts](../../../../packages/subprocess/subprocess-local/tests/windows-inspector.spec.ts) mock 了 `koffi` 以统计 `alloc`/`free`，并断言每次树查询的 1 个枚举行加 4 个 `FILETIME` 槽全部归还；[allocation-release.spec.ts](../../../../packages/sandbox/sandbox-windows-acl/tests/allocation-release.spec.ts) 对授权路径、撤销路径与失败的 DACL 读取做同样的断言。

`AclSandbox` 拥有它生成的子进程的句柄。每次 spawn 注册一个只关闭一次的 latch，由子进程的 `wait()` 与 `AclSandbox.dispose()` 中最先运行的一方释放：inherit 形态的 Job 句柄在 `wait()` 的 `finally` 中关闭（因此失败的退出等待也会释放它），或在 `wait()` 从未运行时由 `dispose()` 关闭；piped 形态的进程句柄由 `waitForProcessExit` 释放，同样在必要时交给 `dispose()`。两个 drain 都保留一个空操作的 rejection 处理，使被遗弃的子进程不会引发 unhandled rejection，同时 `wait()` 仍是报告该失败的那个消费者。

宿主取证是刻意设计且一次性的。`runProfile` 在做任何其它事之前调用 `installCrashReports()`：它创建 `<DSH_HOME>/crash-reports` 并把 `process.report.directory` 指向它，同时设置 `reportOnFatalError = true`，于是下一次致命中止（V8 OOM、C++ 断言、fail-fast）会留下包含 JavaScript 栈、已加载模块与堆摘要的 JSON 报告。目录创建失败时会在 stderr 说明原因并停用该设施——崩溃报告是诊断辅助，永远不是启动前提。

## Alternatives considered

**把 koffi 与 ConPTY 工作搬进子进程，让原生故障无法拖垮宿主。** 这在缺陷已被证实、却未被证明是元凶的情况下改变了每个 Windows 会话的进程拓扑，而且泄漏的内存只会在新进程里继续累积。

**注册 koffi finalizer（`koffi.disposable` / 指向指针的 `FinalizationRegistry`）而不是显式 free。** 终结不确定，且必须在每个分配点与 struct 注册处挂接；显式的 `finally` 把所有权写在读者本来就会去找配对 `CloseHandle` 的地方。

**把 Job 句柄继续留在 `wait()` 内，并用文档要求调用方必须调用它。** 该句柄正是子进程随父进程死亡的原因，因此漏掉一次 `wait()` 会静默地使一项 containment 保证失效，而不只是泄漏一个数字。

**直接吞掉 drain 的 rejection，而不是消费它。** 挂上处理器既能让 unhandled-rejection 报告消失，又让 `wait()` 仍然以管道错误 reject；吞掉则会把真实的抓取失败对唯一能报告它的调用方隐藏起来。

**只记一条 warning，而不写诊断报告。** fail-fast 的进程无法记日志。

## Consequences

宿主进程不再在存活轮询路径或 DACL 编辑上累积原生内存。本机测得的前后对比：同一个 4000 次调用的批量循环在修复前每次调用增长 613–664 字节，修复后连续三批分别为 25、151、−75 字节，即持平。

`<DSH_HOME>/crash-reports` 是新的磁盘产物，没有配置开关。报告包含进程环境与命令行，因此它是宿主私密的诊断数据，应与会话日志放在一起，而不是未经审阅地粘进缺陷报告。

`AclSandbox.dispose()` 现在会关闭从未被 wait 的子进程的句柄，这对被遗弃的**运行中**子进程是行为变更：释放它的 Job 句柄会杀死它。文档化的前提本来就已经是「只在所有子进程退出后调用 dispose()」；现在它同时是让被遗弃的 spawn 可回收的机制。

审计未在 `@deepseek-ai/dsh-win32-process` 或 `session-persistence-jsonl/src/win32.ts` 中发现缺陷；两者都按原样保留，没有基于怀疑去改动。

诚实的边界：这些是真实缺陷，且其画像与长时间运行下的概率性 fail-fast 相符，但这里没有任何证据证明本次泄漏就是观测到的 `0xC0000409` 的成因。取证设施的作用，是让复发变成一步定位，而不是重复一次同样盲目的调查。

## Testing

分配不变量是被直接断言的，而不是靠计时：`koffi` mock 统计并把每次 `free` 与某个 `alloc` 返回的指针对上；移除那 4 次 `FILETIME` 释放会让 subprocess 断言以 `expected "vi.fn()" to be called 5 times, but got 1 times` 失败。

[windows-inspector.spec.ts](../../../../packages/subprocess/subprocess-local/tests/windows-inspector.spec.ts) 在 Windows 上跑真实绑定，在其它平台跑注入 internals 的套件。[index-failure-paths.spec.ts](../../../../packages/sandbox/sandbox-windows-acl/tests/index-failure-paths.spec.ts) 钉住子进程句柄所有权：从未被 wait 的 inherit 子进程由 `dispose()` 关闭它的 Job（移除子进程释放循环后，该断言只能观察到受限 token），piped 子进程贡献一次进程句柄关闭，已 settle 的子进程贡献零次，管道失败仍会让 `wait()` reject。

取证路径通过在一次真实的 V8 内存耗尽中止前配置该目录来验证：报告文件落在配置的目录中。本次调查使用的复现循环是：在同一会话里反复执行 shell 工具调用数分钟、反复开关会话、反复生成并拆解终端——每一个都驱动上述两条已修复路径中的一条。

## Related

复发时的排障入口：

- `$DSH_HOME/crash-reports` 下的报告文件（`report.<时间戳>.<pid>.<序号>.json`）；
- `Get-WinEvent -FilterHashtable @{LogName='Application'}`，按 `Exception code: c0000409` 过滤，其 `Faulting module` 指出中止的库；
- Windows 应用程序日志里的 WER 条目——进程在 WER 介入前死亡时并不存在，上面的报告正是为这一情形准备的替代品。
