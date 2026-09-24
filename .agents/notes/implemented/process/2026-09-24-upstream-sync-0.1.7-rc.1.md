# Agent Note: Integrate the 0.1.7 release candidate with the fork

Status: implemented

English | [中文](2026-09-24-upstream-sync-0.1.7-rc.1.zh.md)

## Problem

The fork's Plan review, SSH host inventory, MCP transports, management UI, CodeGraph, task board, usage reporting, workspace tools, Windows shell controls, and effort slider coexist with upstream's 0.1.7 release candidate. Upstream now also owns the `dsh-ssh` package and `ctx.ssh`, and publishes Session V4 with a V3-to-V4 reader. A direct merge would collide on SSH ownership and could reject the fork's required historical Plan events or silently remove user-visible fork behavior.

## Decision

The fork follows the released upstream profile, agent preset, plugin compatibility, PTC, and client extension interfaces. Its host inventory lives in `@deepseek-ai/dsh-ssh-hosts` on `ctx.sshHosts`; upstream's POSIX remote runtime retains `@deepseek-ai/dsh-ssh` and `ctx.ssh`. The inventory retains its `ssh` Typert namespace, `ssh_list` and `ssh_exec` tools, and `$DSH_HOME/dsh-ssh.json` storage. Cordis activation awaits the inventory load and rejects invalid stored data. Existing preset IDs and default enablement remain stable.

The V3-to-V4 reader validates the fork's historical `plan/approved` and `plan/handoff` events separately from upstream's frozen released V3 event set. Plain and zstd V3 logs remain immutable on read; the first write publishes a V4 successor. Unknown required V3 events still fail closed. The current V4 event additions have a separate [persistence acknowledgement](../../../../docs/persistence-changes/2026-09-24-fork-plan-events.md).

The fork retains the three Plan handoff choices and single-execution claim, MCP SSE and connection status, the client management sections, and the remaining custom tools. Generated catalogs, snapshots, and bilingual records follow their owning generators and replay workflows.

## Alternatives considered

**Reuse `ctx.ssh` for the host inventory.** Rejected because upstream uses that service for a POSIX remote runtime with a different lifecycle and responsibility. Separate Cordis keys allow both services in one profile while preserving the existing browser and tool protocol.

**Add fork events to upstream's released V3 event set.** Rejected because that set records upstream's published bytes. A separate extension validator accepts the fork's historical files without changing the released inventory or weakening rejection of unknown required events.

**Replace the Plan review with upstream's binary review.** Rejected because it cannot express execute, compact, and keep as distinct choices, or preserve the fork's one-time execution handoff.

## Consequences

The two SSH services may be mounted together, and stored fork sessions migrate forward without rewriting their V3 generation. Maintaining the fork's user-visible extensions requires checking real profile composition and client snapshots whenever upstream changes its loader or UI extension points. Real model API behavior requires credentials and remains outside keyless local verification.
