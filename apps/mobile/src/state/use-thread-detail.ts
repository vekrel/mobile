import { useAtomValue } from "@effect/atom-react";
import type { PendingThreadRequests } from "@vekrel/client-runtime/state/thread-requests";
import type { MachineThread } from "@vekrel/client-runtime/state/shell";
import type { MachineId, OrchestrationV2ThreadProjection, ThreadId } from "@vekrel/contracts";
import { Atom } from "effect/reactivity";

import { machineThreadDetails, useMachineThread } from "./threads";
import { useThreadSelection } from "./use-thread-selection";

const EMPTY_THREAD_PROJECTION_ATOM = Atom.make<MachineThread | null>(null).pipe(
  Atom.withLabel("mobile-thread-projection:empty"),
);
const EMPTY_VISIBLE_TURN_ITEMS_ATOM = Atom.make<
  OrchestrationV2ThreadProjection["visibleTurnItems"]
>(Object.freeze([])).pipe(Atom.withLabel("mobile-thread-visible-turn-items:empty"));

export interface ThreadDetailTarget {
  readonly machineId: MachineId | null;
  readonly threadId: ThreadId | null;
}

export function useThreadDetail(target: ThreadDetailTarget) {
  return useMachineThread(target.machineId, target.threadId);
}

export function useSelectedThreadDetailState() {
  const { selectedThreadDetailRef } = useThreadSelection();
  return useMachineThread(
    selectedThreadDetailRef?.machineId ?? null,
    selectedThreadDetailRef?.threadId ?? null,
  );
}

export function useThreadProjection(target: ThreadDetailTarget): MachineThread | null {
  return useAtomValue(
    target.machineId === null || target.threadId === null
      ? EMPTY_THREAD_PROJECTION_ATOM
      : machineThreadDetails.threadAtom({
          machineId: target.machineId,
          threadId: target.threadId,
        }),
  );
}

export function useSelectedThreadProjection(): MachineThread | null {
  const { selectedThreadDetailRef } = useThreadSelection();
  return useThreadProjection({
    machineId: selectedThreadDetailRef?.machineId ?? null,
    threadId: selectedThreadDetailRef?.threadId ?? null,
  });
}

export function useThreadVisibleTurnItems(
  target: ThreadDetailTarget,
): OrchestrationV2ThreadProjection["visibleTurnItems"] {
  return useAtomValue(
    target.machineId === null || target.threadId === null
      ? EMPTY_VISIBLE_TURN_ITEMS_ATOM
      : machineThreadDetails.visibleTurnItemsAtom({
          machineId: target.machineId,
          threadId: target.threadId,
        }),
  );
}

export function useSelectedThreadVisibleTurnItems(): OrchestrationV2ThreadProjection["visibleTurnItems"] {
  const { selectedThreadDetailRef } = useThreadSelection();
  return useThreadVisibleTurnItems({
    machineId: selectedThreadDetailRef?.machineId ?? null,
    threadId: selectedThreadDetailRef?.threadId ?? null,
  });
}

const EMPTY_WORKTREE_PATH_ATOM = Atom.make<string | null>(null);
const EMPTY_PENDING_REQUESTS_ATOM = Atom.make<PendingThreadRequests | null>(null);

export function useSelectedThreadWorktreePath() {
  const { selectedThreadDetailRef } = useThreadSelection();
  return useAtomValue(
    selectedThreadDetailRef === null
      ? EMPTY_WORKTREE_PATH_ATOM
      : machineThreadDetails.worktreePathAtom(selectedThreadDetailRef),
  );
}

export function useSelectedThreadPendingRequests() {
  const { selectedThreadDetailRef } = useThreadSelection();
  return useAtomValue(
    selectedThreadDetailRef === null
      ? EMPTY_PENDING_REQUESTS_ATOM
      : machineThreadDetails.pendingRequestsAtom(selectedThreadDetailRef),
  );
}
