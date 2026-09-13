// =============================================================================
// ds-effort-slider — client plugin logic (React wrapper + forked ModelSelect)
// This file is a FRAGMENT. scripts/build-client.mjs prepends the Web Component
// source from src/ds-effort-slider.js into the same function scope, providing
// LEVELS, the color/math helpers, the effortTiming adapter and the element.
// Edit the component ONLY in src/ds-effort-slider.js; never paste a copy here.
// The demo/ page loads that component source directly.
// =============================================================================

// Canonical level tokens, ordered low to high. The slider never invents a
// level: it renders exactly the adapter-declared effort list, in the adapter's
// order. These tokens only pick a localized label and a visual tier for a
// declared effort; a vocabulary none of them knows keeps the adapter's own
// text and gets no bespoke color or effect.
const CANONICAL_ORDER = ["off", "minimal", "low", "medium", "high", "xhigh", "extra", "max"];
const TIER_ALIASES = {
  default: "off",
  none: "off",
  disabled: "off",
  no: "off",
  auto: "off",
  "no reasoning": "off",
  "no-reasoning": "off",
  "no_reasoning": "off",
  "no effort": "off",
  "no_effort": "off",
  maximum: "max",
  ultracode: "max",
  med: "medium",
  mid: "medium",
  extreme: "extra",
};

function normalizeName(name) {
  return String(name == null ? "" : name)
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, " ")
    .replace(/[()\[\]{}.,:;!?*"]/g, "");
}

// Tier of one adapter-declared effort, or undefined when the provider speaks a
// vocabulary this UI has no tier for. The id is checked first: pi-ai ids are
// the level token itself while names are only its capitalized display form.
function tierToken(effort) {
  for (const candidate of [effort.id, effort.name]) {
    const n = normalizeName(candidate);
    if (!n) continue;
    if (TIER_ALIASES[n]) return TIER_ALIASES[n];
    for (const token of CANONICAL_ORDER) {
      if (n === token) return token;
      if (n.includes(` ${token}`) || n.includes(`${token} `)) return token;
    }
  }
  return void 0;
}

// The slider's level list: exactly the efforts the model advertises, in their
// advertised order. Known tiers take the localized label; everything else
// keeps the adapter's own name so nothing is renamed away from the real config.
function levelsFromReasoning(reasoning, t) {
  if (!reasoning || !Array.isArray(reasoning.efforts)) return [];
  return reasoning.efforts.map((effort) => {
    const canonical = tierToken(effort);
    const key = canonical === void 0 ? void 0 : `level.${canonical}`;
    const localized = key === void 0 ? void 0 : t(key);
    return {
      id: effort.id,
      canonical,
      name: effort.name,
      label: localized === void 0 || localized === key ? effort.name : localized,
    };
  });
}

// The tier the component paints and animates with, mirroring its own table.
function tierOf(level) {
  return level && typeof level.canonical === "string" ? level.canonical : void 0;
}

// 菜单里三块面板的深度：决定切换时哪一侧是"前进"，从而决定滑入/滑出的方向。
const PANE_ORDER = { root: 0, model: 1, effort: 2 };
// 面板进场/退场时长（毫秒）。退场略短于进场，切换才会显得跟手。
const PANE_EXIT_MS = 240;

// --- feature preference stores (localStorage-backed) -------------------------
// 滑动变祖器（梁）、大肥鱼 thumb 与 Ultracode 氛围的开关状态。组件内嵌的梁开关走
// liangStore，设置页的 chibi / ultracode 开关走各自的 store；三处均持久化到
// 当前浏览器。氛围光效默认开启，用户关掉后三层光效一起消失。
function readPref(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === "true";
  } catch {
    return fallback;
  }
}

function makePrefStore(key, fallback) {
  let current = readPref(key, fallback);
  const listeners = new Set();
  const store = {
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next, persist = true) => {
      if (current === next) return;
      current = next;
      if (persist) {
        try {
          window.localStorage.setItem(key, String(next));
        } catch {
          // 当前页面仍然跟随选择；仅持久化失败
        }
      }
      listeners.forEach((listener) => listener());
    },
  };
  return store;
}

const LIANG_STORAGE_KEY = "dsh-client-ui-effort-slider.liang";
const CHIBI_STORAGE_KEY = "dsh-client-ui-effort-slider.chibi";
const ULTRACODE_STORAGE_KEY = "dsh-client-ui-effort-slider.ultracode";
const liangStore = makePrefStore(LIANG_STORAGE_KEY, false);
const chibiStore = makePrefStore(CHIBI_STORAGE_KEY, false);
const ultracodeStore = makePrefStore(ULTRACODE_STORAGE_KEY, true);

// --- React wrapper around <ds-effort-slider> -------------------------------
// React renders the custom element; all non-string interactions happen through
// a ref + effect so we never fight React's attribute serialization.
function EffortSlider(props) {
  const { levels, value, disabled, onChange, labels, liang, chibi, ultracode, onLiangChange } = props;
  const ref = React.useRef(null);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const onLiangChangeRef = React.useRef(onLiangChange);
  onLiangChangeRef.current = onLiangChange;

  // Level count must land before value: `value` clamps against the level list,
  // so a shorter list applied afterwards would strand the thumb out of range.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.levels = levels;
  }, [levels]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.value = value;
  }, [value]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.liang = Boolean(liang);
  }, [liang]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.chibi = Boolean(chibi);
  }, [chibi]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.ultracode = Boolean(ultracode);
  }, [ultracode]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 组件内嵌的梁开关被点击后向上同步状态
    const onLiangToggle = () => {
      onLiangChangeRef.current?.(el.liang);
    };
    el.addEventListener("ds-liang-toggle", onLiangToggle);
    return () => el.removeEventListener("ds-liang-toggle", onLiangToggle);
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onChg = (event) => {
      const index = event.detail && typeof event.detail.index === "number"
        ? event.detail.index
        : (el._levelIndex != null ? el._levelIndex : 0);
      onChangeRef.current(index);
    };
    el.addEventListener("change", onChg);
    return () => el.removeEventListener("change", onChg);
  }, []);

  return React.createElement("ds-effort-slider", {
    ref,
    disabled: disabled ? true : void 0,
    inline: true,
    label: labels && labels.label,
    "axis-low": labels && labels.axisLow,
    "axis-high": labels && labels.axisHigh,
    tooltip: labels && labels.tooltip,
    "input-aria-label": labels && labels.inputAria,
    "help-aria-label": labels && labels.helpAria,
    "liang-label": labels && labels.liangToggle,
  });
}

// --- Forked ModelSelect ------------------------------------------------------

// 菜单里重复出现的 16px 箭头；direction 决定指向（触发器朝下，单元格朝右）。
function Chevron({ direction, className }) {
  const down = direction === "down";
  return React.createElement(
    "svg",
    {
      className: (down ? "ds-effort-chevron" : "ds-effort-cellChevron") + (className || ""),
      viewBox: "0 0 16 16",
      width: "14",
      height: "14",
      "aria-hidden": "true",
    },
    React.createElement("path", {
      d: down ? "M4 6l4 4 4-4" : "M6 4l4 4-4 4",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.5",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    }),
  );
}

// 推理等级面板：整块 JSX 以纯 props + 回调渲染，钩子与共享状态留在
// EffortModelSelect。面板内的控件不因提交中的选择而禁用：range 输入框一旦
// 变成 disabled，浏览器按 focus fixup 把焦点移到 body，菜单会收到
// relatedTarget 为 null 的 focusout 并关闭。去重与过期响应由
// chooseEffort 的相等判断和 ModelDirectory 的 generation 计数器承担。
function EffortPane(props) {
  const {
    t, errorMessage, onReload, levels, value, onChange,
    liang, chibi, ultracode, onLiangChange,
  } = props;
  return [
    errorMessage !== null && React.createElement(
      "div",
      { className: "ds-effort-error", key: "error" },
      React.createElement("span", null, t("error.action", { message: errorMessage })),
      React.createElement("button", { type: "button", className: "ds-effort-retry", onClick: onReload }, t("action.reload")),
    ),
    // A model advertising a single effort has nothing to slide: it reads as one
    // fixed level chip instead of a degenerate one-stop range.
    levels.length < 2
      ? React.createElement(
          "div",
          { className: "ds-effort-levelList", key: "single-level" },
          levels.map((level) => React.createElement(
            "span",
            { className: "ds-effort-levelChip", key: level.id },
            level.label,
          )),
        )
      : React.createElement(EffortSlider, {
          key: "slider",
          levels,
          value,
          onChange,
          liang,
          chibi,
          ultracode,
          onLiangChange,
          labels: {
            label: t("effort.title"),
            axisLow: t("effort.axisLow"),
            axisHigh: t("effort.axisHigh"),
            tooltip: t("effort.tooltip"),
            inputAria: t("effort.ariaLabel"),
            helpAria: t("effort.helpAria"),
            liangToggle: t("liang.toggle"),
          },
        }),
  ];
}

function EffortModelSelect(props) {
  const { locked, available, directory, load, select, t } = props;

  // 目录快照是 uSES 安全的 observable store；直接订阅它，避免
  // useState 镜像带来的撕裂（与仓库 ModelSelect 采用同一模式）。
  const state = React.useSyncExternalStore(
    (onStoreChange) => directory.subscribe(onStoreChange),
    () => directory.getSnapshot(),
  );
  const [open, setOpen] = React.useState(false);
  const [pane, setPane] = React.useState("root");
  // 正在退场的上一块面板，以及当前面板是否已到达"就位"状态。两者都由 CSS
  // 过渡驱动，所以中途再切换是从当前值续走，不会重播。
  const [leavingPane, setLeavingPane] = React.useState(null);
  const [paneSettled, setPaneSettled] = React.useState(true);
  const lastActionRef = React.useRef("load");
  const [toast, setToast] = React.useState(null);
  const toastSeq = React.useRef(0);
  const [chosenIndex, setChosenIndex] = React.useState(null);
  const rootRef = React.useRef(null);
  const triggerRef = React.useRef(null);
  const itemRefs = React.useRef([]);
  const [liang, setLiang] = React.useState(() => liangStore.getSnapshot());
  const [chibi, setChibi] = React.useState(() => chibiStore.getSnapshot());
  const [ultracode, setUltracode] = React.useState(() => ultracodeStore.getSnapshot());

  React.useEffect(() => {
    const unsubLiang = liangStore.subscribe(() => setLiang(liangStore.getSnapshot()));
    const unsubChibi = chibiStore.subscribe(() => setChibi(chibiStore.getSnapshot()));
    const unsubUltracode = ultracodeStore.subscribe(() => setUltracode(ultracodeStore.getSnapshot()));
    return () => {
      unsubLiang();
      unsubChibi();
      unsubUltracode();
    };
  }, []);

  const choices = React.useMemo(() => {
    if (!state || !Array.isArray(state.groups)) return [];
    return state.groups.flatMap((group) =>
      group.models.map((model) => ({
        group,
        model,
        selection: {
          provider: group.id,
          model: model.id,
          ...(model.reasoning && model.reasoning.defaultEffort !== void 0
            ? { reasoningEffort: model.reasoning.defaultEffort }
            : {}),
        },
      })),
    );
  }, [state.groups]);

  const current = state ? state.current : null;
  const currentChoice = current == null
    ? void 0
    : choices.find((c) => c.selection.provider === current.provider && c.selection.model === current.model);
  const reasoning = currentChoice ? currentChoice.model.reasoning : void 0;

  const effectiveEffort = current ? (current.reasoningEffort ?? (reasoning ? reasoning.defaultEffort : void 0)) : void 0;

  // The slider's levels ARE the adapter-declared list: one position per real
  // effort, no phantom slots and nothing left over to offer elsewhere.
  const levels = React.useMemo(() => levelsFromReasoning(reasoning, t), [reasoning, t]);

  // Index of the effort actually applied. The provider default resolves to the
  // level it names, so the thumb always rests on a real level.
  const appliedIndex = React.useMemo(() => {
    const found = levels.findIndex((level) => level.id === effectiveEffort);
    return found >= 0 ? found : 0;
  }, [levels, effectiveEffort]);

  const appliedLevel = levels[appliedIndex];

  const sliderIndex = chosenIndex !== null ? chosenIndex : appliedIndex;

  // The chip names the level the slider rests on. With no explicit effort the
  // provider default resolves to the level it names, and a model advertising no
  // default at all rests on its first level — there is no separate Default
  // state. A model with no reasoning metadata advertises no level at all.
  const baseEffortLabel = reasoning === void 0 || appliedLevel === void 0
    ? void 0
    : appliedLevel.label;

  // 梁开启时：档位名后加段名（如「Max 梁祖」）。段名与组件同源，按档位数
  // 比例取值（构建时同作用域拼接）。
  const liangSuffix = liang && levels.length > 1
    ? LIANG_STAGES[liangStageForIndex(sliderIndex, levels.length)]
    : void 0;
  const displayEffortLabel = baseEffortLabel === void 0 || liangSuffix === void 0
    ? baseEffortLabel
    : `${baseEffortLabel} ${liangSuffix}`;

  // The one tier that turns on the Ultracode ambience.
  const isMaxApplied = tierOf(appliedLevel) === "max";

  const busy = state ? state.status === "selecting" : false;

  // 面板切换：上一个面板留在原地退场（同一个 DOM 节点换 class，因此 React
  // 复用它，过渡从当前可见状态续走），新面板下一帧落到"就位"。
  const goToPane = (next) => {
    if (next === pane) return;
    const forward = (PANE_ORDER[next] || 0) >= (PANE_ORDER[pane] || 0);
    setLeavingPane({ pane, forward });
    setPane(next);
    setPaneSettled(false);
  };

  React.useEffect(() => {
    // 让浏览器先用"进场"状态绘制一帧，随后的 class 变化才有过渡可跑。
    const handle = effortTiming.timeout(() => setPaneSettled(true), 16);
    return () => handle();
  }, [pane]);

  React.useEffect(() => {
    if (leavingPane === null) return;
    const handle = effortTiming.timeout(() => setLeavingPane(null), PANE_EXIT_MS);
    return () => handle();
  }, [leavingPane]);

  const reload = () => {
    lastActionRef.current = "load";
    load();
  };

  React.useEffect(() => {
    if (available) {
      lastActionRef.current = "load";
      load();
    }
  }, [available, load]);

  React.useEffect(() => {
    if (!open) return;
    const closeOutside = (event) => {
      if (!rootRef.current || !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [open]);

  // Auto-dismiss the toast after its countdown finishes. A new toast resets it.
  React.useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!available) return null;

  const show = () => {
    setPane("root");
    setLeavingPane(null);
    setPaneSettled(true);
    setOpen(true);
    reload();
  };

  const close = (restoreFocus) => {
    setOpen(false);
    setPane("root");
    setLeavingPane(null);
    setPaneSettled(true);
    if (restoreFocus) {
      effortTiming.timeout(() => {
        if (triggerRef.current) triggerRef.current.focus();
      }, 0);
    }
  };

  const settleSelection = (accepted) => {
    if (accepted) {
      if (rootRef.current !== null) close(true);
      return;
    }
    const message = directory.getSnapshot().error;
    if (message !== null) {
      toastSeq.current += 1;
      setToast({ seq: toastSeq.current, text: t("error.action", { message }) });
    }
  };

  const settleEffortSelection = (accepted) => {
    if (accepted) return;
    const message = directory.getSnapshot().error;
    if (message !== null) {
      toastSeq.current += 1;
      setToast({ seq: toastSeq.current, text: t("error.action", { message }) });
    }
  };

  const choose = (selection) => {
    if (current && current.provider === selection.provider && current.model === selection.model) {
      close(true);
      return;
    }
    setChosenIndex(null);
    lastActionRef.current = "select";
    const targetChoice = choices.find((c) =>
      c.selection.provider === selection.provider && c.selection.model === selection.model,
    );
    const targetReasoning = targetChoice ? targetChoice.model.reasoning : void 0;
    let finalSelection = selection;
    // Carry the level over only when the new model advertises the same effort
    // id; otherwise leave the choice to the provider default and say so.
    if (effectiveEffort !== void 0) {
      const targetLevels = levelsFromReasoning(targetReasoning, t);
      const carried = targetLevels.find((level) => level.id === effectiveEffort);
      if (carried !== void 0) {
        finalSelection = { ...selection, reasoningEffort: carried.id };
      } else {
        toastSeq.current += 1;
        setToast({ seq: toastSeq.current, text: t("switch.default") });
      }
    }
    select(finalSelection).then(settleSelection);
  };

  const chooseEffort = (index) => {
    if (current == null) return;
    const level = levels[index];
    if (!level) return;
    // The thumb always rests where the user clicked; every position is a real
    // adapter-declared effort, so the click and the applied level agree.
    setChosenIndex(index);
    if (effectiveEffort === level.id) return;
    lastActionRef.current = "select";
    select({ provider: current.provider, model: current.model, reasoningEffort: level.id })
      .then(settleEffortSelection);
  };

  const modelLabel = currentChoice ? currentChoice.model.name : t("trigger.fallback");
  const triggerLabel = displayEffortLabel === void 0 ? modelLabel : `${modelLabel} · ${displayEffortLabel}`;
  const triggerAria = currentChoice === void 0
    ? t("trigger.selectAria")
    : baseEffortLabel === void 0
      ? t("trigger.aria", { model: modelLabel })
      : t("trigger.ariaEffort", { model: modelLabel, effort: displayEffortLabel });

  itemRefs.current = [];
  let itemIndex = 0;
  const itemRef = () => {
    const at = itemIndex++;
    return (node) => {
      itemRefs.current[at] = node;
    };
  };

  const moveFocus = (offset) => {
    const items = itemRefs.current.filter((item) => item !== null);
    if (items.length === 0) return;
    const active = items.findIndex((item) => item === document.activeElement);
    items[(Math.max(active, 0) + offset + items.length) % items.length]?.focus();
  };

  const onRootKeyDown = (event) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      if (pane !== "root") goToPane("root");
      else close(true);
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(event.key === "ArrowDown" ? 1 : -1);
    }
  };

  const menuId = React.useId();
  const onBlur = (event) => {
    const related = event.relatedTarget;
    // 焦点去向未知（控件被禁用/移除、窗口失焦）不算离开菜单：此时浏览器
    // 把焦点移到 body 并抛出 relatedTarget 为 null 的 focusout。真正的
    // "点击外部"由 document 的 mousedown 监听负责关闭。
    if (!(related instanceof Node)) return;
    const root = rootRef.current;
    if (root === null) return;
    const host = typeof related.getRootNode === "function" ? related.getRootNode().host : null;
    if (root.contains(related) || (host && root.contains(host))) return;
    close();
  };

  // One pane's content, keyed by pane name. Rendered for the active pane and,
  // briefly, for the pane that is leaving.
  const renderPaneContent = (key) => {
    if (key === "root") {
      return [
        React.createElement(
          "button",
          { ref: itemRef(), type: "button", role: "menuitem", className: "ds-effort-cell", onClick: () => goToPane("model") },
          React.createElement("span", { className: "ds-effort-cellLabel" }, t("menu.model")),
          React.createElement("span", { className: "ds-effort-cellValue" }, modelLabel),
          React.createElement(Chevron, { direction: "right" }),
        ),
        reasoning !== void 0 && React.createElement(
          "button",
          { ref: itemRef(), type: "button", role: "menuitem", className: "ds-effort-cell", onClick: () => goToPane("effort") },
          React.createElement("span", { className: "ds-effort-cellLabel" }, t("menu.effort")),
          React.createElement("span", { className: "ds-effort-cellValue" }, displayEffortLabel),
          React.createElement(Chevron, { direction: "right" }),
        ),
      ];
    }
    if (key === "model") {
      return [
        state && state.status === "loading" && React.createElement("div", { className: "ds-effort-status" }, t("status.loading")),
        state && state.error !== null && lastActionRef.current === "load" && React.createElement(
          "div",
          { className: "ds-effort-error" },
          React.createElement("span", null, t("error.action", { message: state.error })),
          React.createElement("button", { type: "button", className: "ds-effort-retry", onClick: reload }, t("retry")),
        ),
        state && Array.isArray(state.failures) && state.failures.map((failure) =>
          React.createElement(
            "div",
            { className: "ds-effort-warning", key: failure.id },
            React.createElement("span", null, t("warning.groupLoad", { name: failure.name, message: failure.message })),
            React.createElement("button", { type: "button", className: "ds-effort-retry", onClick: reload }, t("retry")),
          ),
        ),
        React.createElement(
          "div",
          { className: "ds-effort-groups scrollable" },
          state && Array.isArray(state.groups) && state.groups.map((group) => {
            const headingId = "ds-effort-" + group.id;
            return React.createElement(
              "section",
              { role: "group", "aria-labelledby": headingId, className: "ds-effort-group", key: group.id },
              React.createElement("div", { className: "ds-effort-groupTitle", id: headingId }, group.name),
              group.models.map((model) => {
                const selected = current && current.provider === group.id && current.model === model.id;
                return React.createElement(
                  "button",
                  {
                    ref: itemRef(),
                    type: "button",
                    role: "menuitemradio",
                    "aria-checked": !!selected,
                    className: "ds-effort-option" + (selected ? " ds-effort-selected" : ""),
                    title: model.name,
                    disabled: busy,
                    key: model.id,
                    onClick: () => choose({ provider: group.id, model: model.id }),
                  },
                  React.createElement(
                    "span",
                    { className: "ds-effort-optionCopy" },
                    React.createElement("span", { className: "ds-effort-modelName" }, model.name),
                    model.description !== void 0 && React.createElement("span", { className: "ds-effort-description" }, model.description),
                  ),
                  selected && React.createElement("span", { className: "ds-effort-check" }, "✓"),
                );
              }),
            );
          }),
        ),
        state && state.status === "ready" && choices.length === 0 && React.createElement("div", { className: "ds-effort-empty" }, t("empty.models")),
      ];
    }
    return React.createElement(EffortPane, {
      t,
      errorMessage: state && state.error !== null && lastActionRef.current === "load" ? state.error : null,
      onReload: reload,
      levels,
      value: sliderIndex,
      onChange: chooseEffort,
      liang,
      chibi,
      ultracode,
      onLiangChange: (next) => liangStore.set(next),
    });
  };

  return React.createElement(
    "div",
    { ref: rootRef, className: "ds-effort-root", onKeyDown: onRootKeyDown, onBlur },
    // trigger
    React.createElement(
      "button",
      {
        ref: triggerRef,
        type: "button",
        className: "ds-effort-trigger"
          + (isMaxApplied ? " ds-effort-triggerMax" : "")
          + (isMaxApplied && ultracode ? " ds-effort-ultracode" : ""),
        "aria-label": triggerAria,
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": open ? menuId : void 0,
        title: triggerLabel,
        disabled: locked,
        onClick: () => {
          if (open) close();
          else show();
        },
      },
      React.createElement("span", { className: "ds-effort-triggerLabel" }, modelLabel),
      displayEffortLabel !== void 0 && React.createElement("span", { className: "ds-effort-triggerEffort" }, displayEffortLabel),
      React.createElement(Chevron, { direction: "down", className: open ? " ds-effort-chevronOpen" : "" }),
    ),
    // menu
    open && React.createElement(
      "div",
      { id: menuId, className: "ds-effort-menu", role: "menu", "aria-label": t("menu.aria"), "aria-busy": state && (state.status === "loading" || busy) },
      React.createElement(
        "div",
        {
          className: "ds-effort-panes",
          style: { "--ds-effort-pane-dir": leavingPane !== null && !leavingPane.forward ? -1 : 1 },
        },
        // The active pane leads so keyboard traversal index 0 is always a live
        // control; the leaving pane is inert, absolutely placed, and short-lived.
        React.createElement(
          "div",
          {
            key: "pane-" + pane,
            className: "ds-effort-pane" + (paneSettled ? " ds-effort-paneReady" : " ds-effort-paneEnter"),
          },
          renderPaneContent(pane),
        ),
        leavingPane !== null && React.createElement(
          "div",
          {
            key: "pane-" + leavingPane.pane,
            className: "ds-effort-pane ds-effort-paneLeave",
            inert: "",
            "aria-hidden": "true",
          },
          renderPaneContent(leavingPane.pane),
        ),
      ),
    ),
    toast !== null && React.createElement(
      "div",
      { className: "ds-effort-toast", role: "status", key: toast.seq },
      toast.text,
      React.createElement("button", { type: "button", className: "ds-effort-toastClose", onClick: () => setToast(null), "aria-label": t("close") }, "×"),
    ),
  );
}

// --- Settings page switches --------------------------------------------------
// 「设置-通用设置」里的两个开关：大肥鱼 thumb 与 Ultracode 氛围。两者都是
// localStorage 偏好 + useSyncExternalStore，改动实时生效、无需刷新。
function PrefSettingRow({ t, store, titleKey, descriptionKey }) {
  // 插槽未注入 t 时回退到内嵌词典（zh/en 由页面 lang 决定）
  const txt = (key) => {
    if (t) return t(key);
    const lang = typeof document !== "undefined" ? document.documentElement.lang : "";
    const dict = lang && lang.startsWith("en") ? DICT_EN : DICT_ZH;
    return dict[key] || key;
  };
  const enabled = React.useSyncExternalStore(store.subscribe, store.getSnapshot);

  return React.createElement(
    "div",
    { className: "ds-effort-setting-row" },
    React.createElement(
      "div",
      { className: "ds-effort-setting-copy" },
      React.createElement("div", { className: "ds-effort-setting-title" }, txt(titleKey)),
      React.createElement("div", { className: "ds-effort-setting-description" }, txt(descriptionKey)),
    ),
    React.createElement(
      "button",
      {
        type: "button",
        role: "switch",
        "aria-checked": enabled,
        "aria-label": txt(titleKey),
        className: "ds-effort-setting-switch",
        onClick: () => store.set(!enabled),
      },
      React.createElement("span", { className: "ds-effort-setting-knob" }),
    ),
  );
}

/** 大肥鱼 thumb 开关。 */
function ChibiThumbSetting(props) {
  return React.createElement(PrefSettingRow, {
    ...props,
    store: chibiStore,
    titleKey: "chibi.setting.title",
    descriptionKey: "chibi.setting.description",
  });
}

/** Ultracode 氛围光效开关（默认开启）。 */
function UltracodeSetting(props) {
  return React.createElement(PrefSettingRow, {
    ...props,
    store: ultracodeStore,
    titleKey: "ultracode.setting.title",
    descriptionKey: "ultracode.setting.description",
  });
}

// --- locale dictionaries -----------------------------------------------------
const NS = "dsEffort";

const DICT_ZH = {
  "trigger.fallback": "选择模型",
  "trigger.selectAria": "选择模型",
  "trigger.aria": "选择模型，当前 {model}",
  "trigger.ariaEffort": "选择模型，当前 {model}，推理等级 {effort}",
  "menu.aria": "模型与推理等级",
  "menu.model": "模型",
  "menu.effort": "推理等级",
  "effort.title": "推理等级",
  "effort.axisLow": "更快",
  "effort.axisHigh": "更聪明",
  "effort.tooltip": "推理等级越高，思考时间越长。Max 会进行最深度的分析和代码检查。",
  "effort.ariaLabel": "推理等级",
  "effort.helpAria": "关于推理等级",
  "level.off": "关闭",
  "level.minimal": "极简",
  "level.low": "低",
  "level.medium": "中",
  "level.high": "高",
  "level.xhigh": "极高",
  "level.extra": "超高",
  "level.max": "最高",
  "liang.toggle": "滑动变祖器",
  "chibi.setting.title": "大肥鱼滑块",
  "chibi.setting.description": "用大肥鱼替换滑块按钮",
  "ultracode.setting.title": "Ultracode 氛围光效",
  "ultracode.setting.description": "最高推理等级时，为推理面板与输入框加上紫色光效",
  "switch.default": "新模型没有该档位，已改用它的默认档位",
  "status.loading": "正在刷新模型列表…",
  "error.action": "模型操作失败：{message}",
  "retry": "重试",
  "action.reload": "重新加载",
  "warning.groupLoad": "{name} 加载失败：{message}",
  "empty.models": "没有可用的模型。",
  "close": "关闭",
};

const DICT_EN = {
  "trigger.fallback": "Select model",
  "trigger.selectAria": "Select model",
  "trigger.aria": "Select model, current {model}",
  "trigger.ariaEffort": "Select model, current {model}, reasoning effort {effort}",
  "menu.aria": "Model and reasoning effort",
  "menu.model": "Model",
  "menu.effort": "Effort",
  "effort.title": "Reasoning effort",
  "effort.axisLow": "Faster",
  "effort.axisHigh": "Smarter",
  "effort.tooltip": "Higher effort spends more time reasoning. Max adds the deepest analysis and code pass.",
  "effort.ariaLabel": "Effort level",
  "effort.helpAria": "About effort levels",
  "level.off": "Off",
  "level.minimal": "Minimal",
  "level.low": "Low",
  "level.medium": "Medium",
  "level.high": "High",
  "level.xhigh": "Xhigh",
  "level.extra": "Extra",
  "level.max": "Max",
  "liang.toggle": "Liang Calibrator",
  "chibi.setting.title": "Big Fat Fish slider",
  "chibi.setting.description": "Replace the slider thumb with the big fat fish",
  "ultracode.setting.title": "Ultracode ambience",
  "ultracode.setting.description": "Add a violet glow to the effort panel and composer at the top effort level",
  "switch.default": "The new model has no such level; using its default level",
  "status.loading": "Refreshing model list…",
  "error.action": "Model operation failed: {message}",
  "retry": "Retry",
  "action.reload": "Reload",
  "warning.groupLoad": "{name} failed to load: {message}",
  "empty.models": "No models available.",
  "close": "Close",
};

// --- CSS (deep/light via DSW alias tokens) ----------------------------------
const CSS = `
.ds-effort-root{position:relative;min-width:0}
.ds-effort-trigger{min-width:0;max-width:220px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:24px;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:500;line-height:20px;display:flex;transition:box-shadow 560ms cubic-bezier(.4,0,.2,1),background-color 150ms ease-out}
.ds-effort-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.ds-effort-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l2,var(--dsw-alias-brand-primary))}
.ds-effort-trigger:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.ds-effort-triggerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden;transition:color 560ms cubic-bezier(.4,0,.2,1)}
.ds-effort-triggerEffort{color:var(--dsw-alias-label-tertiary);flex:none}
.ds-effort-triggerMax .ds-effort-triggerEffort{background:linear-gradient(90deg,#c9b9ea,#ae9aef,#a2c1ff,#c5b0f4,#c9b9ea);background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:ds-effort-trigger-flow 3.2s linear infinite}
@keyframes ds-effort-trigger-flow{to{background-position:200% center}}
/* Ultracode 氛围：触发器带一圈紫色光晕；输入框（composer card）由 :has() 命中做
   整卡描边与光晕 —— 插件只注入全局样式，不写自身子树之外的 DOM。
   进出都是过渡而非一次性 keyframes：目的地状态决定曲线，所以"亮起"更快、
   "熄灭"更缓，且中途打断时从当前强度续走。 */
.ds-effort-ultracode{position:relative;box-shadow:0 0 0 1px color-mix(in srgb,#8c73c9 38%,transparent),0 0 12px color-mix(in srgb,#8c73c9 30%,transparent);transition-duration:340ms,150ms;transition-timing-function:cubic-bezier(.16,1,.3,1),ease-out}
.ds-effort-ultracode .ds-effort-triggerLabel{color:var(--dsw-alias-label-primary);transition-duration:340ms;transition-timing-function:cubic-bezier(.16,1,.3,1)}
/* 描边环常驻、只让 opacity 归零：规则撤销时才会真的淡出，而不是元素瞬灭。 */
[data-composer-card]::before{content:"";position:absolute;inset:-1px;padding:1px;border-radius:23px;background:linear-gradient(100deg,#a2c1ff,#ae9aef,#c9b9ea,#a2c1ff);background-size:300% 100%;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;opacity:0;pointer-events:none;animation:ds-effort-card-flow 5s linear infinite;transition:opacity 560ms cubic-bezier(.4,0,.2,1)}
[data-composer-card]:has(.ds-effort-ultracode)::before{opacity:1;transition-duration:340ms;transition-timing-function:cubic-bezier(.16,1,.3,1)}
[data-composer-card]{box-shadow:var(--dsw-elevation-soft),0 0 0 1px color-mix(in srgb,#a17ec2 0%,transparent),0 6px 28px color-mix(in srgb,#8c73c9 0%,transparent);transition:box-shadow 560ms cubic-bezier(.4,0,.2,1)}
[data-composer-card]:has(.ds-effort-ultracode){box-shadow:var(--dsw-elevation-soft),0 0 0 1px color-mix(in srgb,#a17ec2 40%,transparent),0 6px 28px color-mix(in srgb,#8c73c9 26%,transparent);transition-duration:340ms;transition-timing-function:cubic-bezier(.16,1,.3,1)}
@keyframes ds-effort-card-flow{to{background-position:300% center}}
@media (prefers-reduced-motion:reduce){[data-composer-card]::before{animation:none}.ds-effort-trigger,[data-composer-card],[data-composer-card]::before,.ds-effort-triggerLabel{transition-duration:0.001ms}}
.ds-effort-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .12s}
.ds-effort-chevronOpen{transform:rotate(180deg)}
.ds-effort-menu{z-index:20;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1));width:min(252px,100vw - 32px);max-height:min(400px,100vh - 96px);box-shadow:var(--dsw-shadow-lv3,0 12px 28px rgba(0,0,0,.12));color:var(--dsw-alias-label-primary);border-radius:12px;flex-direction:column;padding:4px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;overflow-y:auto;overflow-x:hidden;transform-origin:bottom right;animation:ds-effort-menu-in 160ms cubic-bezier(.22,.61,.36,1)}
@keyframes ds-effort-menu-in{from{opacity:0;transform:scale(.97) translateY(4px)}}
/* 面板切换：三块面板各自是一个带稳定 key 的节点，切换时同一个节点换 class，
   于是过渡从它当前的可见状态续走 —— 连续快速点击也只是改变目标，不会重播。
   --ds-effort-pane-dir 由前进/后退决定，+1 向左推、-1 向右推。 */
.ds-effort-panes{position:relative;display:flex;flex-direction:column;gap:2px;min-width:0}
.ds-effort-pane{display:flex;flex-direction:column;gap:2px;min-width:0;transition:opacity 260ms cubic-bezier(.22,1,.36,1),transform 260ms cubic-bezier(.22,1,.36,1),filter 260ms cubic-bezier(.22,1,.36,1)}
.ds-effort-paneEnter{opacity:0;transform:translateX(calc(var(--ds-effort-pane-dir,1) * 12px));filter:blur(2px)}
.ds-effort-paneReady{opacity:1;transform:translateX(0);filter:blur(0)}
.ds-effort-paneLeave{position:absolute;inset:0 0 auto;pointer-events:none;opacity:0;transform:translateX(calc(var(--ds-effort-pane-dir,1) * -12px));filter:blur(2px);transition-duration:200ms;transition-timing-function:cubic-bezier(.4,0,.2,1)}
@media (prefers-reduced-motion:reduce){.ds-effort-pane{transition-duration:0.001ms}}
.ds-effort-status,.ds-effort-empty{color:var(--dsw-alias-label-tertiary);padding:10px;font-size:13px;line-height:20px}
.ds-effort-error,.ds-effort-warning{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-error-primary);border-radius:8px;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px;padding:7px 8px;font-size:12px;line-height:18px;display:flex}
.ds-effort-warning{color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-label-primary))}
.ds-effort-retry{color:inherit;font:inherit;cursor:pointer;background:0 0;border:none;flex:none;padding:0;font-weight:600;white-space:nowrap}
.ds-effort-groups{display:flex;flex-direction:column;gap:2px;overflow-y:auto}
.ds-effort-group{display:flex;flex-direction:column;gap:2px}
.ds-effort-groupTitle{color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:600;line-height:16px;letter-spacing:.02em;padding:6px 8px 2px}
.ds-effort-cell,.ds-effort-option{width:100%;border:0;background:0 0;border-radius:8px;cursor:pointer;display:flex;align-items:center;text-align:left}
.ds-effort-cell{padding:7px 8px;justify-content:space-between;gap:8px;color:var(--dsw-alias-label-primary)}
.ds-effort-cell:hover,.ds-effort-option:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.ds-effort-cellLabel{font-size:13px;font-weight:500;line-height:20px}
.ds-effort-cellValue{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}
.ds-effort-cellChevron{color:var(--dsw-alias-label-tertiary);flex:none}
.ds-effort-option{padding:7px 8px;gap:8px}
.ds-effort-optionCopy{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
.ds-effort-modelName{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.ds-effort-description{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.ds-effort-selected{background:var(--dsw-alias-interactive-bg-selected,var(--dsw-alias-bg-layer-2))}
.ds-effort-check{color:var(--dsw-alias-brand-primary);flex:none;font-size:13px;line-height:20px}
/* A model advertising a single effort renders one static chip instead of a
   one-stop range. */
.ds-effort-levelList{margin-top:8px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1);display:flex;flex-wrap:wrap;gap:6px}
.ds-effort-levelChip{border:1px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-selected,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary);padding:4px 10px;border-radius:999px;font-size:13px;line-height:20px}
.ds-effort-toast{position:absolute;top:calc(100% + 6px);right:0;z-index:30;max-width:280px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-error-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;font-size:12px;line-height:18px;display:flex;align-items:flex-start;gap:8px;box-shadow:var(--dsw-shadow-lv3,0 12px 28px rgba(0,0,0,.12));overflow:hidden;animation:ds-effort-toast-in 220ms cubic-bezier(.22,.61,.36,1)}
.ds-effort-toast::after{content:"";position:absolute;left:0;bottom:0;height:2px;width:100%;background:currentColor;opacity:.45;animation:ds-effort-toast-countdown 2.6s linear forwards}
.ds-effort-toastClose{cursor:pointer;background:0 0;border:0;color:inherit;font-size:14px;line-height:18px;padding:0}
@keyframes ds-effort-toast-in{from{opacity:0;transform:translateX(8px)}}
@keyframes ds-effort-toast-countdown{from{width:100%}to{width:0%}}
@media (prefers-reduced-motion:reduce){.ds-effort-toast{animation:none}}
/* purple accent + dark variants for the Web Component */
ds-effort-slider{--ds-effort-accent:#8c73c9;--ds-effort-accent-deep:#a17ec2;--ds-effort-text:var(--dsw-alias-label-secondary,#5f5b58);--ds-effort-text-strong:var(--dsw-alias-label-primary,#3f3b38);--ds-effort-muted:var(--dsw-alias-label-tertiary,#77736f);--ds-effort-track:var(--dsw-alias-bg-layer-2,#edeae8);--ds-effort-track-fill:var(--dsw-alias-bg-layer-3,#e0dbd6);--ds-effort-surface:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));--ds-effort-outline:var(--dsw-alias-border-l1,rgba(76,70,65,.12))}
body[data-ds-dark-theme] ds-effort-slider{--ds-effort-accent:#a17ec2;--ds-effort-accent-deep:#b39ad6;--ds-effort-track:rgba(255,255,255,.08);--ds-effort-track-fill:rgba(255,255,255,.12);--ds-effort-surface:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1));--light-color:#b9c8ff}
/* settings-page chibi switch. Row metrics, type scale and switch geometry
   mirror the native settings row and the ui-primitives Switch. */
.ds-effort-setting-row{display:flex;align-items:center;gap:8px;padding:16px 0;border-bottom:0.5px solid var(--dsw-alias-border-l2,rgba(121,126,145,.18))}
.ds-effort-setting-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;padding-right:48px}
.ds-effort-setting-title{color:var(--dsw-alias-label-primary,#15171b);font-size:14px;font-weight:400;line-height:22px}
.ds-effort-setting-description{color:var(--dsw-alias-label-tertiary,#9296a0);font-size:12px;line-height:18px}
.ds-effort-setting-switch{position:relative;box-sizing:border-box;width:36px;height:20px;padding:2px;border:0;border-radius:10px;background:var(--dsw-alias-border-l3,#c7cbd3);cursor:pointer;transition:background 150ms ease;flex:none}
.ds-effort-setting-switch[aria-checked='true']{background:var(--dsw-alias-brand-primary,#4f73ff)}
.ds-effort-setting-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f73ff);outline-offset:2px}
.ds-effort-setting-switch:disabled{cursor:default;opacity:.5}
.ds-effort-setting-knob{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground,#fff);transition:transform 120ms ease}
.ds-effort-setting-switch[aria-checked='true'] .ds-effort-setting-knob{transform:translateX(16px)}
`;

// --- plugin -------------------------------------------------------------------
return {
  inject: ["slots", "sessions", "modelDirectories", "timer", "locale"],  apply(ctx) {
    const slots = ctx.slots;
    const sessions = ctx.sessions;
    const models = ctx.modelDirectories;

    // Resolve the timer SERVICE object once, inside apply(): ctx.timeout /
    // ctx.interval are ctx mixins that lazily resolve the service through the
    // context, and the context goes INACTIVE after apply() returns. Holds only
    // the service instance so the Web Component can keep using timers later.
    const timerSvc = ctx.timer || ctx.get("timer");
    effortTiming = {
      timeout: (cb, delay) => timerSvc.timeout(cb, delay),
      interval: (cb, delay) => timerSvc.interval(cb, delay),
      raf: (cb) => timerSvc.interval(cb, 16),
    };

    const styleId = "dsh-client-ui-effort-slider/styles";
    if (typeof document !== "undefined" && !document.querySelector(`style[data-plugin-css="${styleId}"]`)) {
      const style = document.createElement("style");
      style.dataset.plugin = "dsh-client-ui-effort-slider";
      style.dataset.pluginCss = styleId;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const locale = ctx.locale || ctx.get("locale");
    if (locale) {
      ctx.effect(() => locale.register(NS, { zh: DICT_ZH, en: DICT_EN }), "ds-effort-slider: dictionaries");
    }

    // 大肥鱼 thumb 与 Ultracode 氛围开关 → DSH「设置-通用设置」插槽。
    // 同一个 inject 里产出两条注册，随声明一起安装、一起回滚。
    if (slots && typeof slots.inject === "function") {
      slots.inject("settings.general.item", function* () {
        yield slots.register(
          { name: "settings.general.item", id: "effort-slider-chibi-thumb", order: 20 },
          ChibiThumbSetting,
        );
        yield slots.register(
          { name: "settings.general.item", id: "effort-slider-ultracode", order: 21 },
          UltracodeSetting,
        );
      });
    }

    slots.inject("conversation.input.model", () => slots.register({
      name: "conversation.input.model",
      priority: -1,
      locale: NS,
      inject: (sessionId) => {
        const directory = models.directoryFor(sessionId);
        const available = sessions.subagentAddress(sessionId) === void 0;
        return {
          available,
          directory: directory.store,
          load: () => {
            if (available) directory.load().catch(() => {});
          },
          select: (selection) => available
            ? directory.select(selection).then(() => true, () => false)
            : Promise.resolve(false),
        };
      },
    }, EffortModelSelect));
  },
};
