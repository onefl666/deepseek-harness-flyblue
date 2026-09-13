# Agent Note: The Git graph panel resolves its own workspace and draws lanes as SVG

Status: implemented

[English](2026-09-13-git-graph-workspace-scope-and-lanes.md) | 中文

## Problem

浏览器 Git 面板（`@deepseek-ai/dsh-client-ui-git-graph`）随发行版带出三类缺陷，均已在代码中复现：

- **作用域。** 注册的 inject face 以 Workspace Controller 快照的 `items[0]?.workspaceId` 解析目标工作区，而组件显示路径时又从同一快照独立读取一次 `items[0]?.path`。面板没有任何方式指向别的工作区；并且由于 `refresh` 闭包捕获的是稳定的 inject face，工作区列表变化时它的 `useEffect` 从不重跑：在侧边栏切换工作区后，面板仍显示上一个仓库的历史。
- **识别。** `@deepseek-ai/dsh-workspace-git` 把 `git status --porcelain=v1 -z` 当作「每条记录一个条目」解析，但重命名或复制会输出两条（源路径紧随其记录，`->` 形式被省略），于是重命名产生一条幽灵行，其状态对是文件名的前两个字节。所有仓库类动词都以工作区目录为工作目录运行，而 Git 返回的状态路径相对工作树根，因此当工作区是仓库的子目录时 `git add -- <上报路径>` 会以 `fatal: pathspec 'sub/z.txt' did not match any files` 失败。`branches` 从 `%(HEAD)` 读取当前分支，而 detached HEAD 会得到合成的 `(HEAD detached at …)` 名称。`graph` 运行 `git log` 时没有 `--topo-order`，其按时间倒序的顺序并不保证提交先于其父提交出现。`operationInProgress` 直接 stat `git rev-parse --git-path` 的原始输出，而 Git 打印的路径相对命令的工作目录，因此 merge/rebase 守卫从未生效。不在任何工作树内的目录与读取失败无法区分。
- **渲染。** 泳道分配无条件把提交自身的列设为它的第一个父提交，于是一个已拥有列的父提交会让同一提交同时在两列等待，画出没有任何提交会收敛的主干。泳道区宽度由「继续中的列数」而非最大列号得出，因此两个占用列之间的空列会丢失宽度。每一行在带 2 px 间距的列表里绘制自己的固定高度列，把每条主干切成两段。主干无论列号一律绘制为同一个中性色，圆点用 box-shadow 挖孔、其光环与行 hover 底色不一致，而父提交位于另一列的提交完全没有连接线。

## Decision

两个包现在都提供面板所需的契约，并且面板自行解析作用域。

**Host 拥有 Git 的文本格式。** `@deepseek-ai/dsh-workspace-git` 新增 `src/porcelain.ts`：一个零依赖模块，承载 `parseStatus`、`parseBranches`、`parseGraph`、`parseWorkTree`、`parseHead`、`parseBranch` 与 `assertRelativePath`；`src/index.ts` 成为其上的子进程胶水。`parseStatus` 把重命名的第二条记录折叠进对应条目，作为 `origPath`。工作树探测的答案取自 stdout 而非退出状态，唯一被匹配的失败文本是「未指明任何仓库」的拒绝——并且只在探测时使用 `LC_ALL=C` 环境，因为 Git 用消息而非状态码表达仓库缺失。所有仓库类动词先解析一次 `rev-parse --show-toplevel`，然后以该根为工作目录运行，这使上报路径可以原样用作变更目标，并修复了「分支已被另一个 worktree 签出」的比较。

**`graph` 的回答携带仓库身份，而不只是提交。** `GitGraphView` 为 `{ repository: GitRepositoryView | null, entries: GitGraphEntry[] }`；`repository` 携带工作树根、HEAD 哈希与当前分支，而 `null` 是「该目录不在任何工作树内」的定义性回答。因此面板无需匹配错误文本即可区分「不是仓库」与「读取失败」。`branches` 返回 `GitBranchEntry`，detached HEAD 时 `current` 为 `null`；`status` 条目携带 `origPath`；`--topo-order` 是无条件的：泳道分配依赖提交先于其父提交出现，因此该标志是正确性要求而非部署选项，`Config` 保持不变。

**面板从框架 hook 解析自身作用域。** `resolveWorkspaceId(workspaces, currentSessionId, sessionsById, preferred)` 跟随当前正在使用的会话所属工作区——按会话记录的目录匹配，即工作区导航既有的规则——在显式选择仍指向已登记工作区时尊重该选择，否则退回登记顺序。组件通过全局 `useWorkspaces` 与 `useSessions` 席位读取该选择；inject face 只承载 Remote 动词，不再解析 id。作用域变化会重置面板并重新读取，序号计数器丢弃一切在最新读取之前启动的回答，包括拒绝。

**泳道是纯模型，以 SVG 绘制。** `src/client/graph.ts` 承载 `graphRows`：它在放置父提交之前先释放提交自身的列，因此已经拥有列的父提交保留该列；每一行报告其所在列、上方是否有主干到达、穿过该行的列，以及每个父提交被绘制到的列。`laneCount` 取最大绘制列加一。`connectorPath` 与 `laneCenter` 与几何常量放在一起，组件把 `ROW_HEIGHT` 作为 `--graph-row-height` 注入列表，使样式表与绘制读取同一个数值。主干携带其所在列的调色板颜色，分支尖端圆点上方没有线，非首个父提交得到垂直相切的曲线，圆点是实心填充圆，从而消除了 hover 光环。

**只有 Git 能恢复的路径才提供丢弃。** `statusMeta` 返回 `discardable`，未跟踪条目为 false，因为 `git restore --worktree` 无法移除 Git 不跟踪的路径。

## Alternatives considered

- **保持面板只作用于第一个工作区，仅修复重新读取。** 改动最小，但把上报的缺陷——无法选择工作区——留在原地，而且那两处独立的 `items[0]` 读取会继续对「屏幕上是哪个仓库」各执一词。
- **由 `ui-workspace` 发布一个解析后的全局工作区席位。** 该包由上游拥有，不在本发行版的分叉集合内；为一个面板新增共享席位会让它成为第十七个分叉包。两个框架 hook 已经暴露该规则所需的全部事实。
- **为面板新增独立的 `repository()` 动词，而不是在 `graph` 上使用信封。** 每次刷新多一次 RPC，并且重新引入信封已经回答的顺序问题：只有在仓库存在后状态与分支才有意义，而在它们之后回答的探测无法对其失败分类。
- **`git log --all`。** 已考虑并否决：本发行版的所有者要求 HEAD 可达历史，其它分支在分支卡片中识别与切换。Host README 记录了这一后果。
- **沿用每列一个定位 `<div>` 绘制泳道。** 垂直主干可以保留，但列之间的连接线不行：曲线正是 SVG 路径直接表达的形状，而行平铺的修复依赖组件与样式表共同读取的几何。
- **把工作区选择器提升到 `ui-primitives`。** 该提升规则在第二个包需要某控件时触发；唯一能证明它的同级面板（`ui-workspace-inspector`）不在本次改动范围内，而且该选择器由共享的 `Menu` 原语组合而成，而非重述它。
- **为每个提交行限制引用标签数量。** 否决，改为单行裁切并在该行的悬停提示中保留完整列表：上限即调参项，而提示让每个标签仍可触达。

## Consequences

- 面板现在跟随正在使用的会话，并可指向任意工作区；该选择保存在组件内，因此重新打开设置面板会回到当前会话的工作区。README 记录了该限制。
- 当工作区是仓库的子目录时，面板显示相对仓库根的路径——即其自身变更操作接受的路径——而不是相对工作区的路径。
- `@deepseek-ai/dsh-workspace-git` 获得了它的首批测试（`tests/porcelain.spec.ts`，以及基于真实临时仓库的 `tests/service.spec.ts`），两个包都达到每文件 100% 覆盖率；`parseWorkTree` 的「仓库缺失」匹配与 `operationInProgress` 的非 ENOENT `lstat` 分支分别由真实 Git 与一处有理由的 `v8 ignore` 固定。
- `graph` 动词的回答形状改变，因此生成的 Typert 工件已重建；client 半边依赖重建后的 `lib/typert.remote-client.d.ts`，并新增 `@deepseek-ai/dsh-workspace-git`、`@deepseek-ai/dsh-client-ui-session`、`@deepseek-ai/dsh-api-session-controller`、`@deepseek-ai/dsh-session` 作为仅类型的开发依赖。
- 会话日志、agent-loop 与模型可见面均未改变，面板也不注册模型可见内容，因此没有新增或重录会话快照。

## Testing

`pnpm run test:gui` 覆盖两个包。Host 套件在临时仓库中驱动真实 `git`——重命名解码、子目录工作区、合并的父提交顺序、detached HEAD、无提交的分支、不在任何工作树内的目录、被另一 worktree 占用的分支、进行中的 merge，以及 Git 无法运行的工作区目录——并在没有 Git 的主机上跳过。client 套件固定泳道模型及其绘制结果：主干列、合并绘制的曲线、圆点上方无线的分支尖端、注入的行高、会话解析到的工作区、作用域变化时的重新读取、被放弃作用域的回答被丢弃，以及单个数据面失败不影响其它数据面。
