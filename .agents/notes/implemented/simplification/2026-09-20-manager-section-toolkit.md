# Agent Note: One toolkit for manager settings sections

Status: implemented

English | [中文](2026-09-20-manager-section-toolkit.zh.md)

## Problem

The MCP server manager and the skill manager each carry a settings section that reads a listing over the wire, offers a user-or-workspace scope, searches it, and reports load failures. Written side by side, they had grown the same plumbing twice: a read lifecycle that retires superseded replies, a scope picker over the workspace list, a toolbar row, and the loading and failure branches. Cross-file clone detection reported ten duplicated regions between them, and the copies had already drifted: both sections announced the outcome of a row mutation by passing a dictionary key into a helper whose parameter was the announcement text, so the toast rendered `toastEnabled` instead of the sentence the dictionary holds.

## Decision

`@deepseek-ai/dsh-client-ui-primitives` carries the machinery both sections need, next to the `SectionChrome` and `SearchField` they already shared:

- `useRemoteList(list, scope)` owns one listing's lifecycle — the newest read wins, a mutation reconciles from the Host's reply rather than predicting an outcome, and the busy flag ends with whichever reply concluded last.
- `useScopeChoice(workspaces)` owns the scope choice: the union the section reads (`ManagerScope`), the picker's selection, and whether the choice names a workspace the list does not supply. It memoizes its result, because the sections read their listing by that identity.
- `ScopePicker`, `SectionToolbar`, and `SectionState` are the three pieces of section chrome those values render: the trigger and its workspace menu, the toolbar row (picker, search field, trailing actions), and the loading/failure/body switch.
- `sectionToolbarLabels(t)` reads the toolbar's copy from the section's own translate seat. The six keys it needs are one `SectionToolbarKey` union, so the names live once instead of being respelled at each call site; both manager dictionaries already publish them.

Each manager keeps what is its own: its Remote verbs and wire types, its dictionary, its rows, and its dialogs.

## Alternatives considered

**Mark the parallel bodies with `jscpd:ignore`.** The repository's ignore markers exist for deliberate mirrors of code that cannot be reused — the placement pass that duplicates a primitive's hook, for instance. This machinery is ordinary reusable React and state, so marking it would hide a real extraction.

**Give the toolkit its own package.** A third manager section would still be three callers of five exports; the primitives package is where a control shared between client plugins belongs, and it already hosts the two pieces these sections shared.

**Pass the toolbar a label object from each section.** Rejected: the six key names would be respelled at every call site, which is the duplication this change removes.

## Consequences

The manager packages gain no dependency — the listing reply is stated structurally, so the primitives stay free of the protocol package. `ManagerScope` is structurally the union each package already declares for its own verbs, so a section passes it straight through; the wire contract stays the manager's. The row-mutation toasts now render their copy rather than the dictionary key, which is what the call sites always meant.

## Testing

`useRemoteList` is pinned for the first read, a failed read, a reply retired by a mutation, a settled and a failed mutation, a replayed announcement, a busy state that ends with the retiring reply, and a scope change that re-reads. `useScopeChoice` is pinned for the opening state, a resolved workspace, a return to the user scope, a choice the list does not supply, and the identity it must keep across renders. `ScopePicker`, `SectionToolbar`, and `SectionState` are pinned on their rendered states and reported selections. Both manager section suites — the settings surfaces that exercise toggles, dialogs, and failures — pass unchanged.
