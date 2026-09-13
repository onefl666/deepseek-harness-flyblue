# Agent Note: 计划命令附件

Status: implemented

[English](2026-09-13-plan-command-attachments.md) | 中文

## 问题

`@deepseek-ai/dsh-plan-handoff` 在已交付组合中替换 `@deepseek-ai/dsh-plan-mode`，而其 `/plan` 注册声明为 `input: { hint: '[off|message]' }`，缺少 `attachments: true`，handler 也只读取 `rawInput`。Web 编辑器与宿主命令执行器都按该声明决定附件准入，因此携带图片或文件的 `/plan` 提交在 handler 运行前就被拒绝，计划模式始终拿不到任务材料。客户端 fixture 早已声明 `attachments: true`，这正是该缺口表现为 fixture 与宿主不一致、而非客户端报错的原因。

## 决策

`/plan` 声明 `input.attachments`，注册表因而准入已持久化的图片与文件块，并按提交顺序作为 `CommandInvocation.attachments` 传给 handler。语法归 handler：确切参数 `off` 且至少带一个附件时，在触碰计划状态之前返回错误 `Attachments cannot accompany /plan off.`；任何既有文本又有附件、或只有其一的进入调用，都通过 `agent.steer()` 恰好 steer 一条用户消息，其块为按提交顺序的已准入附件，后缀非空时再附上修剪后的文本块。因此带附件的裸 `/plan` steer 一条只含附件的消息，两者皆无的裸 `/plan` 不 steer 任何消息。

## 考虑过的替代方案

**只声明 `attachments: true` 而不接线 handler。** 拒绝提示消失，但已准入的块被静默丢弃，用户会以为模型收到了它从未看到过的材料。

**仿 `/goal` 用单独的 `agent.followup()` 消息携带附件。** 该路径会产生两条用户消息，并把任务文本与其图片分离，只读 followup 的模型会丢失指令。

**在 `/plan off` 上静默忽略附件而不报错。** 用户的编辑器提交读起来像已被接受，附件却被丢弃，客户端也不保留可供重试的草稿。

## 后果

附件准入沿用共享的命令路径；客户端无需改动，因为通用 claim、序列化与释放逻辑在定义声明了该能力之后本就完备。handler 返回错误时，派发的编辑器会保留草稿与附件卡，这正是 `/plan off` 拒绝可恢复的原因。

## 测试

[plan-mode.spec.ts](../../../../packages/plan/plan-handoff/tests/plan-mode.spec.ts) 以真实的 `CommandRuntime` 与伪造的附件存储驱动：`/plan sketch the layout` 带一张图片与一个文件时 steer 一条 `[image, file, text]` 消息；裸 `/plan` 带同样附件时 steer 一条 `[image, file]` 消息；`/plan off` 带附件时返回该错误，`steer` 未被调用且 `ctx.planMode.get` 仍为激活。
