# Agent Note: 推理滑块跟随模型声明的推理档位

Status: implemented

[English](2026-09-13-effort-slider-declared-levels.md) | 中文

## Problem

已发布的 Claude 风格滑块画的是固定的 `Off | Low | Medium | High | Extra | Max` 六档，再把各适配器公布的档位映射到这套调色板上，于是模型从未提供过的 `Medium`、`Extra` 也会出现。点击这些并不存在的落点时，滑块会悄悄改成其下方最近的真实档位，并用降级 toast 解释这次替换。DeepSeek 公布的是 `Off | Low | High | Max`，也就是说半条可见轨道都不可达，而一个真实档位的颜色取决于它在这套杜撰调色板里的位置，而不是它自己。

Ultracode 的身份也被限制在轨道内：Claude Code 的 ultracode effort 徽章使用与主题无关的内置紫色（[issue #70398](https://github.com/anthropics/claude-code/issues/70398)），而 DSH 的最高档只给轨道和文字重新上色。

## Decision

`src/client.js` 通过 `levelsFromReasoning` 直接从模型适配器公布的 `reasoning.efforts` 推导滑块的档位列表 —— 顺序、数量、id 都一致。没有可映射的固定调色板，也没有 `supported` 布尔数组：每个落点提交的就是它自己代表的 effort id。只公布一个档位的模型渲染一枚固定胶囊，而不是只有一节的滑轨。

公布的档位名会被归一化到 tier（`none`/`disabled` → off、`ultracode`/`maximum` → max、`med` → medium、`extreme` → extra、pi-ai 的 `Xhigh`），由 tier 选出本地化标签。tier 不认识的词汇保留适配器原文，也不带专属配色与特效。`Default` 胶囊、厂商专属额外胶囊、最近支持档位回退及其降级 toast 全部移除：触发芯片显示的就是滑块手柄停留的档位（适配器公布的默认档位，否则是它公布的第一档），界面上不再出现任何 `Default` 状态。

`src/ds-effort-slider.js` 从位置身份改为 tier 身份：颜色按 canonical token 查表，`data-level`（索引）变成 `data-tier`（字符串），High/Extra 涟漪场由 tier 选择（`data-field="high" | "extra"`，`xhigh` 共用 extra 处理），`_syncLevels` 按真实档位数重建刻度、触发条与 `aria-valuemax`。滑动变祖器通过 `liangStageForIndex` 按比例铺开六段名，因此任意档位数下最低档永远是「小难梁」，最高档永远是「梁祖」。

Ultracode 氛围把最高 `max` tier 的表现延伸到轨道之外：推理面板的流动渐变描边、外发光与内层洗色，像素场上更亮的入场冲击波与缓慢的极光扫过，以及触发芯片的紫色光晕。输入框由插件全局样式里的 `[data-composer-card]:has(.ds-effort-ultracode)` 命中 —— 插件依旧不往自身 DOM 子树之外写任何东西，与 `packages/client` 中没有任何 feature plugin 这么做过这一事实保持一致。**设置 → 通用设置 → Ultracode 氛围光效** 一行（默认开启，与大肥鱼开关一样落在 `localStorage`）关闭整层效果；`prefers-reduced-motion` 下退化为静态紫描边与文字色。

氛围与菜单面板切换在**两个方向**上都是可打断的动画。氛围的每一层都常驻，由同一个强度驱动：`--ds-effort-ultracode` 是注册过的 `<number>`，其过渡带着面板的描边、圆环、洗色与光晕，因此撤掉状态触发的是真实的淡出而不是元素消失；画布侧的对应量（`_reveal`、`_ultracodeIntensity`）每帧用帧率无关的指数逼近当前值走向目标，而不是一次性斜坡。任何地方都不读"已经过了多久"，所以中途掉头 —— 从 `Max` 拖回去、切换设置开关、来回走档 —— 都从屏幕上已有的强度续走。离开 `Max` 后 `data-pixels-ready` 与绘制循环会一直存活到强度归零，入场冲击波只在"正在增亮"时出现（退场不会重新点亮它），而氛围的绽放与像素场分开相乘，开关因此永远不会动到像素场本身。菜单的三块面板是带稳定 key 的节点：退场的那块保持挂载、inert 且绝对定位地淡出，进场的那块从前进方向进入，所以在它结束前再点一次只是把同一段动效掉头 —— React 复用了该节点，CSS 从它当前的计算值插值。

## Alternatives considered

**用 keyframes 做氛围动画。** 否决：`animation` 每次被（重新）应用都会从第一帧重播，于是 Max → High → Max 的快速来回看起来就是闪烁；而且状态类一旦移除就没有任何动画可跑。常驻图层上的过渡从计算值出发，这正是掉头能连续的原因。

**用"起始时间 + 时长"的 JS 补间。** 同样否决：被打断时它要么跳到新曲线的起点，要么得手工搬移速度；而指数逼近只要保留当前值就自带 C0 连续。

**保留固定调色板并隐藏不支持的落点。** 否决：在固定轨道里隐藏位置，要么在轨道几何上留下空洞，要么产出一条长度可变的轨道 —— 但它仍然是一套调色板，档位身份依旧是位置性的，于是同一个档位在不同模型间变色，轨道长度也永远对不上模型给出的档位。

**把厂商专属档位做成标准滑块下方的额外胶囊。** 这正是名字无法归入 canonical token 时此前的做法。在滑块直接渲染已声明档位之后被否决：胶囊行与轨道会成为表达同一集合的两套竞争方式，而只有非标准档位名的厂商会看到一条空轨道外加把每个档位都做成胶囊。

**保留 Default 胶囊。** 被用户否决：当每个落点都是真实档位后，另设一个「不发送任何值」的控件与「一档对应一个声明档位」自相矛盾。只读的 `Default` 芯片同样被否决：它命名的是一个面板其余部分无法表达的状态，而手柄总得停在某处。手柄停在模型公布的第一档，芯片就显示它。

**改从宿主新增字段读取档位列表，而不是 `reasoning.efforts`。** 否决：`ModelReasoning` 已经携带了选择器必须呈现的那份有序档位，第二份投影只会需要持续与适配器目录保持同步。

**往输入框卡片上写 `data-*` 属性来驱动光环。** 否决：框架没有发布全局 DOM 或 CSS 状态的 API，也没有任何 feature plugin 写过自身 slot 子树之外的属性，因此为了一层装饰效果引入一条新的跨包 DOM 约定并不值得。改用 `:has()` 读取触发器自己的状态类，在不支持 `:has()` 的环境下退化为没有卡片光效。

## Consequences

可见轨道始终与模型的真实档位吻合，落点的颜色与特效是档位自身的属性而不是位置的属性，所以 `High` 在四档模型和六档模型上看起来一致。公布未知词汇的模型依然可用，但它的档位没有涟漪或像素特效。

切换模型从「降到下方最近档位」变成「按 id 保留」：只有当新模型公布相同 id 时档位才延续，否则改用新模型的默认档位并弹出 toast。这比原先严格地更不聪明 —— `High` 不再延续到只提供 `Low`/`Max` 的模型 —— 但这正是让滑块诚实的原因，另一种做法会把拇指停在新模型根本没有的档位上。

Ultracode 氛围是插件本地的装饰而非主题 token：它使用插件自己的 `--ds-effort-*` 颜色，不扩展主题包的 alias 集合，三层效果由同一个偏好统一开关。

## Testing

`apps/web/tests/effort-slider-levels.e2e.ts` 在声明了 `reasoningEfforts: { off: null, high: 'high', max: 'ultra' }` 的 profile 上启动真实 web 装配，断言滑块恰好渲染三个落点（`aria-valuemax` 为 `2`、三个刻度、没有 `menuitemradio`，且面板里任何位置都不出现 `Medium`/`Extra`/`Default` 文案），`Home`/`End`/方向键依次把 `off`、`high` 写进 `settings.yaml` 并推动芯片，且最高档给触发器与输入框卡片打开 `ds-effort-ultracode`，退回 `high` 时两者一起消失、卡片恢复出厂阴影。该场景无需密钥：声明与切换只是 settings/llm 流量。

`apps/web/tests/declared-reasoning.e2e.ts` 保留其 overlay 禁用行，继续把推理声明契约钉在原生 `ui-model-selection` 菜单上，于是两个界面现在各自独立地断言同一份已声明档位。`pnpm run test:gui` 通过整客户端 roster 覆盖插件加载，这是唯一能自动发现纯 JS 浏览器半边是否还能激活的检查。

web e2e 文件属于 host 程序而非 `apps/web/tsconfig.json`：它必须同时出现在该项目的 `exclude` 数组与 `tsconfig.host.json` 的 `include` 列表里，紧挨 `apps/web/tests/support.ts`。漏掉任一边，在拥有它的那条通道里都是静默的，而在另一边则大声报错：漏掉 `exclude` 会让 client 注册的项目去编译 host 脚手架，于是构建被跨项目的 `TS6059`/`TS6307` 淹没——连 `vendor/` 也会被按基础编译选项检查、而失去它自己放宽的选项；漏掉 `include` 则让文件无人认领，类型感知的 lint 会把它的 `ctx` 值报成 `error` 类型。

## Related

- [Web 默认搭载 Claude 风格推理滑块](2026-08-17-web-effort-slider-default.zh.md)
- [由语言环境拥有的客户端 UI 文案](../../implemented/architecture/2026-08-23-locale-owned-client-ui-copy.zh.md)
