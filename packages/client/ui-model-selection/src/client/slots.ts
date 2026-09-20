/**
 * Injected faces of this package's two seats: the composer's
 * 'conversation.input.model' and the plan-review card's
 * 'question.planReview.model'. Both targets are declared (children tables) and
 * typed by their owning entries; this package only contributes the single
 * occupant of each, so no SlotMap merge lives here.
 */
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from './directory.ts'

/** Injected business face of the composer model seat. */
export interface ModelSelectInjected {
  /** Whether this session supports Agent-bound model inspection and selection. */
  available: boolean
  /** The session's shared directory store (same instance the /model popup reads). */
  directory: SnapshotStore<ModelDirectoryState>
  /** Ensure the shared advisory catalog is loaded (errors land on the store). */
  load: () => void
  /**
   * Select a complete provider/model/reasoning selection.
   * @param selection - model selection and optional adapter-owned effort.
   * @returns whether the host accepted the selection.
   */
  select: (selection: ModelSelection) => Promise<boolean>
}

/** Injected business face of the plan-review execution-model control. */
export interface ModelExecutionSelectInjected {
  /** Whether this session supports Agent-bound model inspection and selection. */
  available: boolean
  /** The session's shared directory store (same instance the composer seat reads). */
  directory: SnapshotStore<ModelDirectoryState>
  /** Ensure the shared advisory catalog is loaded (errors land on the store). */
  load: () => void
}
