# Agent Note: Win32 native allocation and handle lifetime

Status: implemented

English | [中文](2026-09-19-win32-native-resource-lifetime.zh.md)

## Problem

The `dsh` CLI host process died on Windows with `0xC0000409` (`STATUS_STACK_BUFFER_OVERRUN`, the code Windows uses for a fail-fast abort) under pnpm, which reported only `ELIFECYCLE`. Nothing else survived the process: no stderr line, no Windows Error Reporting entry, no diagnostic report. The crash was probabilistic and correlated with long-running sessions, which is the profile of gradual resource exhaustion or of a heap operation on memory that was never the heap's to manage.

A static audit of every `koffi` allocation in the host process found two live defects of that class.

`@deepseek-ai/dsh-subprocess-local`'s [windows-inspector.ts](../../../../packages/subprocess/subprocess-local/src/windows-inspector.ts) took a `PROCESSENTRY32W` (568 bytes) per process-table enumeration and four `FILETIME` slots (32 bytes) per liveness question, and never returned either. `koffi.alloc` is a bare `calloc` with no finalizer, so those blocks stayed in the host for its whole lifetime; the terminal's Windows teardown polls liveness every 25 ms while a session closes, so a 100-process tree closing costs roughly 0.7 MB per terminal that is never recovered. Measured on this machine, a single `WindowsProcessInspector.snapshot().tree(pid)` loop grew RSS by 613–664 bytes per iteration without bound; after the fix the same loop is flat.

`@deepseek-ai/dsh-sandbox-windows-acl` had the same shape at three scales: five pointer out-parameter slots per DACL read, one per `SetEntriesInAclW` merge, and the 32-byte `OVERLAPPED` per path lock, plus several token-shape slots. Its `AclSandbox.spawn` closed the kill-on-close Job only inside `wait()`, so a caller that spawned and never waited — or a `waitForExit` that threw — leaked the Job handle and, worse, kept `KILL_ON_JOB_CLOSE` from ever firing. Both `drainPipe` calls started eagerly with no rejection handler, so an unawaited child reported a pipe failure as a process-level unhandled rejection instead of through `wait()`.

## Decision

Every `koffi.alloc` block is released by exactly one `koffi.free` on every path out of the scope that made it, and the `finally` that closes the Win32 handle the block fed is that scope. [ffi.ts](../../../../packages/sandbox/sandbox-windows-acl/src/ffi.ts) exports `freeNative` for the sandbox package; the subprocess inspector calls `koffi.free` directly. The pairing is a unit-level invariant with an assertable path, not a comment: [windows-inspector.spec.ts](../../../../packages/subprocess/subprocess-local/tests/windows-inspector.spec.ts) mocks `koffi` to count `alloc`/`free` and asserts one enum row plus four `FILETIME` slots per tree question are all returned, and [allocation-release.spec.ts](../../../../packages/sandbox/sandbox-windows-acl/tests/allocation-release.spec.ts) does the same for a granted path, a revoked path, and a DACL read that fails.

`AclSandbox` owns the handles of the children it spawns. Each spawn registers a latch that closes exactly once, and whichever of the child's `wait()` or `AclSandbox.dispose()` runs first releases it: the inherit shape's Job handle closes in `wait()`'s `finally` (so a failed exit wait still frees it) or from `dispose()` when `wait()` never ran, and the piped shape's process handle is released by `waitForProcessExit` or, again, by `dispose()`. Both drains keep a no-op rejection handler so an abandoned child cannot surface an unhandled rejection, while `wait()` remains the consumer that reports the failure.

Host forensics are deliberate and one-shot. `runProfile` calls `installCrashReports()` before anything else: it creates `<DSH_HOME>/crash-reports` and points `process.report.directory` at it with `reportOnFatalError = true`, so the next fatal abort (V8 OOM, C++ assertion, fail-fast) leaves a JSON report with the JavaScript stack, the loaded modules, and the heap summary. A directory that cannot be created reports why on stderr and disables the facility — crash reporting is a diagnostic aid, never a boot prerequisite.

## Alternatives considered

**Move koffi and the ConPTY work into a child process so a native fault cannot take the host down.** It changes the process topology of every Windows session on the strength of a defect that is proven but not proven causal, and the leaked memory would simply accumulate in the new process.

**Register a koffi finalizer (`koffi.disposable` / a `FinalizationRegistry` over the pointer) instead of explicit frees.** Finalization is not deterministic and would have to be attached at every allocation site and struct registration; the explicit `finally` states the ownership where a reader already looks for the matching `CloseHandle`.

**Keep the Job handle inside `wait()` only and document that callers must call it.** The handle is what makes the child die with its parent, so a missed `wait()` silently disables a containment guarantee rather than merely leaking a number.

**Swallow drain rejections instead of consuming them.** Attaching the handler keeps the unhandled-rejection report away while `wait()` still rejects with the pipe error; swallowing would hide a real capture failure from the only caller that can report it.

**Log a warning instead of writing a diagnostic report.** A fail-fast process cannot log.

## Consequences

The host process no longer accumulates native memory on the liveness-poll path or on DACL edits. The measured before/after on this machine: the same 4000-call batch loop that grew 613–664 bytes per call before the fix is flat afterwards (25, 151, −75 bytes per call across three consecutive batches).

`<DSH_HOME>/crash-reports` is a new on-disk product artifact with no configuration switch. The report includes the process environment and the command line, so it is host-private diagnostic data and belongs beside the session logs, not in a bug report pasted without review.

`AclSandbox.dispose()` now closes handles of children that were never waited on, which is a behavior change for an abandoned *running* child: releasing its Job handle kills it. The documented precondition was already "call dispose() only after all children have exited"; it is now also the mechanism that makes an abandoned spawn recoverable.

The audit found no defect in `@deepseek-ai/dsh-win32-process` or `session-persistence-jsonl/src/win32.ts`; both were left alone rather than changed on suspicion.

The honest boundary: these are real defects whose profile matches a long-running probabilistic fail-fast, but nothing here proves this leak caused the observed `0xC0000409`. The forensic facility is what turns a recurrence into a one-step diagnosis instead of a repeat of the same blind investigation.

## Testing

The allocation invariant is asserted directly, not by timing: the `koffi` mock counts and matches every `free` against the pointer an `alloc` returned, and removing the four `FILETIME` frees makes the subprocess assertion fail with `expected "vi.fn()" to be called 5 times, but got 1 times`.

[windows-inspector.spec.ts](../../../../packages/subprocess/subprocess-local/tests/windows-inspector.spec.ts) runs the real bindings on Windows and the injected-internals suites everywhere. [index-failure-paths.spec.ts](../../../../packages/sandbox/sandbox-windows-acl/tests/index-failure-paths.spec.ts) pins child-handle ownership: an inherit child that was never waited on has its Job closed by `dispose()` (and removing the child-release loop makes that assertion observe only the restricted token), a piped child contributes one process-handle close, a settled child contributes none, and a pipe failure still rejects `wait()`.

The forensic path was verified by forcing a real V8 out-of-memory abort with the directory configured: the report file lands in the configured directory. The reproduction loops used during this investigation were: repeat a shell tool call in one session for several minutes, open and close sessions repeatedly, and spawn and tear down terminals repeatedly — each of which drives one of the two fixed paths.

## Related

Troubleshooting entry points for a recurrence:

- the report files under `$DSH_HOME/crash-reports` (`report.<timestamp>.<pid>.<seq>.json`);
- `Get-WinEvent -FilterHashtable @{LogName='Application'}` filtered on `Exception code: c0000409`, whose `Faulting module` names the library that aborted;
- the Windows application log's WER entries, which are absent when the process dies before WER engages — the report above is the replacement for exactly that case.
