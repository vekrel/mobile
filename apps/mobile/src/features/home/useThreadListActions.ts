import type { ThreadMoveDestination } from "../threads/threadOrder";
import type { MachineThreadShell } from "@vekrel/client-runtime/state/shell";
import * as ThreadUndo from "@vekrel/client-runtime/state/thread-undo";
import { showThreadUndoNotice } from "./thread-undo-notice";
import { canSnooze, effectiveSnoozed } from "@vekrel/client-runtime/state/thread-settled";
import { AuthOrchestrationOperateScope } from "@vekrel/contracts";
import * as Cause from "effect/Cause";
import * as Haptics from "expo-haptics";
import { useRef } from "react";

import { withThreadDismissal } from "./thread-dismissal";
import * as Dialog from "../../components/ui/Dialog";
import { scopedThreadKey } from "../../lib/scopedEntities";
import { refreshArchivedThreadsForMachine } from "../archive/useArchivedThreadSnapshots";
import { pinOrderKeyBetween } from "@vekrel/client-runtime/state/thread-sort";
import { appAtomRegistry } from "../../state/atom-registry";
import { machineServerConfigsAtom } from "../../state/server";
import { readMachineScope } from "../../state/session";
import { machineThreadShells, threadMachine } from "../../state/threads";
import { queuedThreadKeysAtom } from "../../state/use-thread-outbox";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  beginPendingThreadOrder,
  getPendingThreadOrder,
  threadDropBusyAtom,
} from "../../state/thread-order";
import {
  createPendingThreadOrder,
  createThreadMovePlanner,
  threadDropLifecycle,
} from "../threads/threadOrder";
import { getThreadListV2OrderedSection } from "../threads/threadListV2";
import { threadCanArchive } from "./threadArchive";
import { resolveThreadTitleRename } from "../threads/thread-title-rename";

/** Version skew: never send settle/unsettle to a server that predates them
    (capability defaults false on decode for older servers). */
function machineSupportsSettlement(machineId: MachineThreadShell["machineId"]) {
  return (
    appAtomRegistry.get(machineServerConfigsAtom).get(machineId)?.machine.capabilities
      .threadSettlement === true
  );
}

function machineSupportsSnooze(machineId: MachineThreadShell["machineId"]) {
  return (
    appAtomRegistry.get(machineServerConfigsAtom).get(machineId)?.machine.capabilities
      .threadSnooze === true
  );
}

function machineSupportsPinning(machineId: MachineThreadShell["machineId"]) {
  return (
    appAtomRegistry.get(machineServerConfigsAtom).get(machineId)?.machine.capabilities
      .threadPinning === true
  );
}

function machineSupportsPinReorder(machineId: MachineThreadShell["machineId"]) {
  return (
    appAtomRegistry.get(machineServerConfigsAtom).get(machineId)?.machine.capabilities
      .threadPinReorder === true
  );
}

function machineSupportsAutoSettleOptOut(
  machineId: MachineThreadShell["machineId"],
) {
  return (
    appAtomRegistry.get(machineServerConfigsAtom).get(machineId)?.machine.capabilities
      .threadAutoSettleOptOut === true
  );
}

function machineSupportsTitleRegeneration(
  machineId: MachineThreadShell["machineId"],
) {
  return (
    appAtomRegistry.get(machineServerConfigsAtom).get(machineId)?.machine.capabilities
      .threadTitleRegeneration === true
  );
}

type ThreadListAction = "archive" | "unarchive" | "delete" | "settle" | "unsettle";

const ACTION_VERBS: Record<ThreadListAction, string> = {
  archive: "archived",
  unarchive: "unarchived",
  delete: "deleted",
  settle: "settled",
  unsettle: "un-settled",
};

function actionFailureMessage(action: ThreadListAction, cause: Cause.Cause<unknown>): string {
  const error = Cause.squash(cause);
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return `The thread could not be ${ACTION_VERBS[action]}.`;
}

function selectionHaptic(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

function actionFailureTitle(action: ThreadListAction): string {
  if (action === "archive") return "Could not archive thread";
  if (action === "unarchive") return "Could not unarchive thread";
  if (action === "settle") return "Could not settle thread";
  if (action === "unsettle") return "Could not un-settle thread";
  return "Could not delete thread";
}

function checkThreadOperationPermission(thread: MachineThreadShell, title: string): boolean {
  if (readMachineScope(thread.machineId, AuthOrchestrationOperateScope)) return true;
  Dialog.alert(title, "This connection cannot change threads.");
  return false;
}

function useThreadActionExecutor(
  onCompleted?: (action: ThreadListAction, thread: MachineThreadShell) => void,
) {
  const archiveMutation = useAtomCommand(threadMachine.archive, { reportFailure: false });
  const unarchiveMutation = useAtomCommand(threadMachine.unarchive, { reportFailure: false });
  const deleteMutation = useAtomCommand(threadMachine.delete, { reportFailure: false });
  const settleMutation = useAtomCommand(threadMachine.settle, { reportFailure: false });
  const unsettleMutation = useAtomCommand(threadMachine.unsettle, { reportFailure: false });
  const inFlightThreadKeys = useRef(new Set<string>());

  const executeAction = async (
    action: ThreadListAction,
    thread: MachineThreadShell,
    onStarted?: () => void,
  ) => {
    if (!checkThreadOperationPermission(thread, actionFailureTitle(action))) return false;
    const key = scopedThreadKey(thread.machineId, thread.id);
    if (inFlightThreadKeys.current.has(key)) {
      return false;
    }

    inFlightThreadKeys.current.add(key);
    selectionHaptic();
    const succeeded = await (async () => {
      if (
        (action === "settle" || action === "unsettle") &&
        !machineSupportsSettlement(thread.machineId)
      ) {
        Dialog.alert(
          actionFailureTitle(action),
          "This machine's server does not support settling yet. Update the server to use Settle.",
        );
        return false;
      }
      if (action === "archive" && !threadCanArchive(thread.runtime)) {
        Dialog.alert(
          actionFailureTitle(action),
          "This thread is working. Interrupt it first, then try again.",
        );
        return false;
      }
      if (action === "unsettle") ThreadUndo.invalidate("settle", key);
      if (action === "archive" || action === "delete") {
        for (const kind of ["settle", "snooze", "pin"]) ThreadUndo.invalidate(kind, key);
      }
      onStarted?.();
      const result = await withThreadDismissal(
        key,
        async () =>
          action === "unsettle"
            ? // reason "user" pins the thread active: auto-settle stays
              // suppressed until real activity clears the pin server-side.
              await unsettleMutation({
                machineId: thread.machineId,
                input: { threadId: thread.id, reason: "user" },
              })
            : await (
                action === "settle"
                  ? settleMutation
                  : action === "archive"
                    ? archiveMutation
                    : action === "unarchive"
                      ? unarchiveMutation
                      : deleteMutation
              )({
                machineId: thread.machineId,
                input: { threadId: thread.id },
              }),
        (result) => result._tag === "Success",
      );
      if (result._tag === "Failure") {
        Dialog.alert(actionFailureTitle(action), actionFailureMessage(action, result.cause));
        return false;
      }
      if (action === "archive" || action === "unarchive" || action === "delete") {
        refreshArchivedThreadsForMachine(thread.machineId);
      }
      onCompleted?.(action, thread);
      return true;
    })();
    inFlightThreadKeys.current.delete(key);
    return succeeded;
  };

  return executeAction;
}

// A plain function, not a hook: a `use*` function that calls no hooks is skipped by
// the compiler, so the delete handler it returned was a new closure every render.
function confirmThreadDeletion(
  executeAction: (action: ThreadListAction, thread: MachineThreadShell) => Promise<boolean>,
  thread: MachineThreadShell,
) {
  if (!checkThreadOperationPermission(thread, actionFailureTitle("delete"))) return;
  const title = "Delete thread?";
  const message = `“${thread.title}” will be permanently deleted, including its terminal history.`;
  Dialog.confirm({
    title,
    message,
    confirmText: "Delete",
    destructive: true,
    onConfirm: () => {
      void executeAction("delete", thread);
    },
  });
}

export function useThreadListActions(): {
  readonly archiveThread: (thread: MachineThreadShell) => Promise<boolean>;
  readonly confirmDeleteThread: (thread: MachineThreadShell) => void;
  readonly settleThread: (thread: MachineThreadShell) => Promise<boolean>;
  readonly snoozeThread: (thread: MachineThreadShell, snoozedUntil: string) => Promise<boolean>;
  readonly unsnoozeThread: (thread: MachineThreadShell) => Promise<boolean>;
  readonly unsettleThread: (thread: MachineThreadShell) => Promise<boolean>;
  readonly pinThread: (thread: MachineThreadShell) => Promise<boolean>;
  readonly unpinThread: (thread: MachineThreadShell) => Promise<boolean>;
  readonly setThreadAutoSettle: (
    thread: MachineThreadShell,
    enabled: boolean,
  ) => Promise<boolean>;
  readonly moveThread: (
    thread: MachineThreadShell,
    direction: ThreadMoveDestination,
  ) => Promise<boolean>;
  readonly renameThread: (thread: MachineThreadShell) => void;
  readonly regenerateThreadTitle: (thread: MachineThreadShell) => Promise<boolean>;
} {
  const executeAction = useThreadActionExecutor();
  const snoozeMutation = useAtomCommand(threadMachine.snooze, { reportFailure: false });
  const unsnoozeMutation = useAtomCommand(threadMachine.unsnooze, { reportFailure: false });
  const pinMutation = useAtomCommand(threadMachine.pin, { reportFailure: false });
  const unpinMutation = useAtomCommand(threadMachine.unpin, { reportFailure: false });
  const setAutoSettleMutation = useAtomCommand(threadMachine.setAutoSettle, {
    reportFailure: false,
  });
  const updateThreadMetadata = useAtomCommand(threadMachine.updateMetadata, {
    reportFailure: false,
  });
  const snoozeInFlightThreadKeys = useRef(new Set<string>());
  const titleRegenerationInFlightThreadKeys = useRef(new Set<string>());

  const archiveThread = (thread: MachineThreadShell) => executeAction("archive", thread);
  const offerUndo = (
    thread: MachineThreadShell,
    action: "Settled" | "Snoozed" | "Unpinned",
    claim: ReturnType<typeof ThreadUndo.begin>,
    plan: ThreadUndo.ThreadUndoPlan,
  ) =>
    showThreadUndoNotice({
      action,
      claim,
      undo: async () => {
        try {
          await ThreadUndo.executeThreadUndo(
            plan,
            async (step) => {
              switch (step.action) {
                case "unsettle":
                  return unsettleThread(thread);
                case "unsnooze":
                  return unsnoozeThread(thread);
                case "pin":
                  return pinThread(thread, step.orderKey);
                case "snooze": {
                  const failureTitle =
                    action === "Unpinned" ? "Could not undo unpin" : "Could not undo settle";
                  if (!checkThreadOperationPermission(thread, failureTitle)) return false;
                  const result = await snoozeMutation({
                    machineId: thread.machineId,
                    input: { threadId: thread.id, snoozedUntil: step.snoozedUntil },
                  });
                  if (result._tag === "Failure") {
                    const error = Cause.squash(result.cause);
                    Dialog.alert(
                      "Could not restore snooze",
                      error instanceof Error ? error.message : "The thread could not be snoozed.",
                    );
                    return false;
                  }
                  return true;
                }
              }
            },
            (result) => result,
          );
        } catch (error) {
          Dialog.alert(
            "Could not undo thread action",
            error instanceof Error ? error.message : "Try again.",
          );
        }
      },
    });
  const settleThread = async (thread: MachineThreadShell) => {
    const key = scopedThreadKey(thread.machineId, thread.id);
    const plan = ThreadUndo.planThreadUndo("settle", thread);
    let claim: ReturnType<typeof ThreadUndo.begin> | undefined;
    const succeeded = await executeAction("settle", thread, () => {
      ThreadUndo.invalidate("pin", key);
      ThreadUndo.invalidate("snooze", key);
      claim = ThreadUndo.begin("settle", key);
    });
    if (claim) {
      if (succeeded) offerUndo(thread, "Settled", claim, plan);
      else claim.finish();
    }
    return succeeded;
  };
  const snoozeThread = async (thread: MachineThreadShell, snoozedUntil: string) => {
    if (!checkThreadOperationPermission(thread, "Could not snooze thread")) return false;
    const key = scopedThreadKey(thread.machineId, thread.id);
    if (snoozeInFlightThreadKeys.current.has(key)) {
      return false;
    }
    snoozeInFlightThreadKeys.current.add(key);
    const succeeded = await (async () => {
      if (!machineSupportsSnooze(thread.machineId)) {
        Dialog.alert(
          "Could not snooze thread",
          "This machine's server does not support snoozing yet. Update the server to use Snooze.",
        );
        return false;
      }
      if (!canSnooze(thread, { now: new Date().toISOString() })) {
        Dialog.alert(
          "Could not snooze thread",
          thread.hasPendingApprovals ||
            thread.hasPendingUserInput ||
            thread.pendingSubagentRequest != null
            ? "This thread is waiting on you. Respond to the pending request before snoozing it."
            : "This thread is still starting a turn. Try again once it's running.",
        );
        return false;
      }

      selectionHaptic();
      const claim = ThreadUndo.begin("snooze", key);
      const result = await withThreadDismissal(
        key,
        () =>
          snoozeMutation({
            machineId: thread.machineId,
            input: {
              threadId: thread.id,
              snoozedUntil,
            },
          }),
        (result) => result._tag === "Success",
      );
      if (result._tag === "Failure") {
        claim.finish();
        const error = Cause.squash(result.cause);
        Dialog.alert(
          "Could not snooze thread",
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "The thread could not be snoozed.",
        );
        return false;
      }
      offerUndo(thread, "Snoozed", claim, ThreadUndo.planThreadUndo("snooze"));
      return true;
    })();
    snoozeInFlightThreadKeys.current.delete(key);
    return succeeded;
  };
  const unsnoozeThread = async (thread: MachineThreadShell) => {
    if (!checkThreadOperationPermission(thread, "Could not wake thread")) return false;
    const key = scopedThreadKey(thread.machineId, thread.id);
    if (snoozeInFlightThreadKeys.current.has(key)) {
      return false;
    }
    snoozeInFlightThreadKeys.current.add(key);
    const succeeded = await (async () => {
      if (!machineSupportsSnooze(thread.machineId)) {
        Dialog.alert(
          "Could not wake thread",
          "This machine's server does not support snoozing yet. Update the server to wake this thread.",
        );
        return false;
      }

      selectionHaptic();
      ThreadUndo.invalidate("snooze", key);
      const result = await withThreadDismissal(
        key,
        () =>
          unsnoozeMutation({
            machineId: thread.machineId,
            input: { threadId: thread.id, reason: "user" },
          }),
        (result) => result._tag === "Success",
      );
      if (result._tag === "Failure") {
        const error = Cause.squash(result.cause);
        Dialog.alert(
          "Could not wake thread",
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "The thread could not be woken.",
        );
        return false;
      }
      return true;
    })();
    snoozeInFlightThreadKeys.current.delete(key);
    return succeeded;
  };
  const unsettleThread = async (thread: MachineThreadShell) =>
    (await executeAction("unsettle", thread)) === true;
  const pinThread = async (thread: MachineThreadShell, restoreOrderKey?: string) => {
    if (!checkThreadOperationPermission(thread, "Could not pin thread")) return false;
    if (!machineSupportsPinning(thread.machineId)) {
      Dialog.alert(
        "Could not pin thread",
        "This machine's server does not support pinning yet. Update the server to use Pin.",
      );
      return false;
    }
    selectionHaptic();
    // Same placement as web: a fresh pin takes the top of the arranged
    // run. Servers that predate reordering get the bare pin (keyless).
    let orderKey: string | undefined;
    if (machineSupportsPinReorder(thread.machineId)) {
      const shells = appAtomRegistry.get(machineThreadShells.threadShellsAtom);
      let firstKey: string | null = null;
      for (const shell of shells) {
        if (shell.pinnedAt == null || shell.pinOrderKey == null) continue;
        if (firstKey === null || shell.pinOrderKey < firstKey) firstKey = shell.pinOrderKey;
      }
      orderKey = pinOrderKeyBetween(null, firstKey) ?? undefined;
    }
    orderKey = machineSupportsPinReorder(thread.machineId)
      ? (restoreOrderKey ?? orderKey)
      : undefined;
    ThreadUndo.invalidate("pin", scopedThreadKey(thread.machineId, thread.id));
    // Pinning clears snooze, so older Settled or Snoozed undos would fight this pin.
    ThreadUndo.invalidate("settle", scopedThreadKey(thread.machineId, thread.id));
    ThreadUndo.invalidate("snooze", scopedThreadKey(thread.machineId, thread.id));
    const result = await withThreadDismissal(
      scopedThreadKey(thread.machineId, thread.id),
      () =>
        pinMutation({
          machineId: thread.machineId,
          input: { threadId: thread.id, ...(orderKey !== undefined ? { orderKey } : {}) },
        }),
      (result) => result._tag === "Success",
    );
    if (result._tag === "Failure") {
      const error = Cause.squash(result.cause);
      Dialog.alert(
        "Could not pin thread",
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "The thread could not be pinned.",
      );
      return false;
    }
    return true;
  };
  const unpinThread = async (thread: MachineThreadShell) => {
    if (!checkThreadOperationPermission(thread, "Could not unpin thread")) return false;
    if (!machineSupportsPinning(thread.machineId)) {
      Dialog.alert(
        "Could not unpin thread",
        "This machine's server does not support pinning yet. Update the server to use Pin.",
      );
      return false;
    }
    selectionHaptic();
    const plan = ThreadUndo.planThreadUndo("unpin", thread);
    const claim = ThreadUndo.begin("pin", scopedThreadKey(thread.machineId, thread.id));
    const result = await withThreadDismissal(
      scopedThreadKey(thread.machineId, thread.id),
      () =>
        unpinMutation({
          machineId: thread.machineId,
          input: { threadId: thread.id },
        }),
      (result) => result._tag === "Success",
    );
    if (result._tag === "Failure") {
      claim.finish();
      const error = Cause.squash(result.cause);
      Dialog.alert(
        "Could not unpin thread",
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "The thread could not be unpinned.",
      );
      return false;
    }
    offerUndo(thread, "Unpinned", claim, plan);
    return true;
  };
  const setThreadAutoSettle = async (thread: MachineThreadShell, enabled: boolean) => {
    if (!machineSupportsAutoSettleOptOut(thread.machineId)) {
      Dialog.alert(
        "Could not update auto-settle",
        "This machine's server does not support turning auto-settle off per thread yet. Update the server to use it.",
      );
      return false;
    }
    selectionHaptic();
    const result = await setAutoSettleMutation({
      machineId: thread.machineId,
      input: { threadId: thread.id, enabled },
    });
    if (result._tag === "Failure") {
      const error = Cause.squash(result.cause);
      Dialog.alert(
        "Could not update auto-settle",
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "The auto-settle setting could not be changed.",
      );
      return false;
    }
    return true;
  };
  const regenerateThreadTitle = async (thread: MachineThreadShell) => {
    if (!checkThreadOperationPermission(thread, "Could not regenerate title")) return false;
    const key = scopedThreadKey(thread.machineId, thread.id);
    if (thread.titleRegeneration != null || titleRegenerationInFlightThreadKeys.current.has(key)) {
      return false;
    }
    if (!machineSupportsTitleRegeneration(thread.machineId)) {
      Dialog.alert(
        "Could not regenerate title",
        "This machine's server does not support title regeneration yet. Update the server to regenerate thread titles.",
      );
      return false;
    }

    titleRegenerationInFlightThreadKeys.current.add(key);
    selectionHaptic();
    const succeeded = await (async () => {
      const result = await updateThreadMetadata({
        machineId: thread.machineId,
        input: { threadId: thread.id, regenerateTitle: true },
      });
      if (result._tag === "Failure") {
        const error = Cause.squash(result.cause);
        Dialog.alert(
          "Could not regenerate title",
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "The thread title could not be regenerated.",
        );
        return false;
      }
      return true;
    })();
    titleRegenerationInFlightThreadKeys.current.delete(key);
    return succeeded;
  };
  const renameThread = (thread: MachineThreadShell) => {
    const commit = (title: string) => {
      const resolution = resolveThreadTitleRename({ title, originalTitle: thread.title });
      if (resolution.action === "reject-empty") {
        Dialog.alert("Could not rename thread", "Thread title cannot be empty.");
        return;
      }
      if (resolution.action === "noop") return;
      selectionHaptic();
      void updateThreadMetadata({
        machineId: thread.machineId,
        input: { threadId: thread.id, title: resolution.title },
      }).then((result) => {
        if (result._tag === "Success") return;
        const error = Cause.squash(result.cause);
        Dialog.alert(
          "Could not rename thread",
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "The thread could not be renamed.",
        );
      });
    };

    Dialog.prompt({
      title: "Rename thread",
      initialValue: thread.title,
      confirmText: "Rename",
      onConfirm: commit,
    });
  };

  // Plan against the complete section so filtering does not change a move.
  const reorderPinnedMutation = useAtomCommand(threadMachine.reorderPin, {
    reportFailure: false,
  });
  const reorderActiveMutation = useAtomCommand(threadMachine.reorderActive, {
    reportFailure: false,
  });
  const moveThread = async (thread: MachineThreadShell, direction: ThreadMoveDestination) => {
    if (!checkThreadOperationPermission(thread, "Could not move thread")) return false;
    if (getPendingThreadOrder() !== null || appAtomRegistry.get(threadDropBusyAtom)) return false;
    const shells = appAtomRegistry.get(machineThreadShells.threadShellsAtom);
    const current = shells.find(
      (row) => row.id === thread.id && row.machineId === thread.machineId,
    );
    if (!current || current.archivedAt !== null) return false;
    thread = current;
    const section =
      typeof direction === "object" && direction.section !== undefined
        ? direction.section
        : thread.pinnedAt != null
          ? "pinned"
          : "active";
    if (section === "settled") {
      if (!machineSupportsSettlement(thread.machineId)) return false;
      appAtomRegistry.set(threadDropBusyAtom, true);
      const settled = await settleThread(thread);
      appAtomRegistry.set(threadDropBusyAtom, false);
      return settled;
    }
    const configs = appAtomRegistry.get(machineServerConfigsAtom);
    const supportsReorder = (machineId: MachineThreadShell["machineId"]) => {
      const capabilities = configs.get(machineId)?.machine.capabilities;
      return section === "pinned"
        ? capabilities?.threadPinReorder === true
        : capabilities?.threadActiveReorder === true;
    };
    if (!supportsReorder(thread.machineId)) {
      Dialog.alert(
        "Could not move thread",
        "This machine's server does not support reordering these threads. Update the server to arrange them.",
      );
      return false;
    }
    const ordered = getThreadListV2OrderedSection({
      threads: shells,
      section,
      now: new Date().toISOString(),
      queuedThreadKeys: appAtomRegistry.get(queuedThreadKeysAtom),
      settlementMachineIds: new Set(
        [...configs].flatMap(([id, config]) =>
          config.machine.capabilities.threadSettlement === true ? [id] : [],
        ),
      ),
      snoozeMachineIds: new Set(
        [...configs].flatMap(([id, config]) =>
          config.machine.capabilities.threadSnooze === true ? [id] : [],
        ),
      ),
    });
    const assignments = createThreadMovePlanner({
      allThreads: shells,
      ordered,
      section,
      reorderableMachineIds: new Set([...configs.keys()].filter(supportsReorder)),
    })(scopedThreadKey(thread.machineId, thread.id), direction);
    if (assignments === null) return false;
    const lifecycle = threadDropLifecycle(thread, section, new Date().toISOString());
    const crossSection = !ordered.some(
      (row) => row.id === thread.id && row.machineId === thread.machineId,
    );
    if (
      crossSection &&
      (((section === "pinned" || thread.pinnedAt != null) &&
        !machineSupportsPinning(thread.machineId)) ||
        (thread.settledOverride === "settled" &&
          !machineSupportsSettlement(thread.machineId)) ||
        (effectiveSnoozed(thread, { now: new Date().toISOString() }) &&
          !machineSupportsSnooze(thread.machineId)))
    )
      return false;
    const shellByKey = new Map(
      shells.map((shell) => [scopedThreadKey(shell.machineId, shell.id), shell]),
    );
    for (const assignment of assignments) {
      const target = shellByKey.get(assignment.id);
      if (target && !checkThreadOperationPermission(target, "Could not move thread")) return false;
    }
    selectionHaptic();
    appAtomRegistry.set(threadDropBusyAtom, true);
    const pending = crossSection
      ? null
      : beginPendingThreadOrder(
          createPendingThreadOrder({
            section,
            ordered,
            movedId: scopedThreadKey(thread.machineId, thread.id),
            direction,
            assignments,
          }),
        );
    const reorder = section === "pinned" ? reorderPinnedMutation : reorderActiveMutation;
    const moved = await (async () => {
      if (crossSection) {
        if (section === "pinned") {
          const orderKey = assignments.find(
            ({ id }) => id === scopedThreadKey(thread.machineId, thread.id),
          )?.orderKey;
          // Same as pinThread: older Unpinned, Settled, or Snoozed undos would fight this pin.
          ThreadUndo.invalidate("pin", scopedThreadKey(thread.machineId, thread.id));
          ThreadUndo.invalidate("settle", scopedThreadKey(thread.machineId, thread.id));
          ThreadUndo.invalidate("snooze", scopedThreadKey(thread.machineId, thread.id));
          const result = await pinMutation({
            machineId: thread.machineId,
            input: { threadId: thread.id, ...(orderKey === undefined ? {} : { orderKey }) },
          });
          if (result._tag === "Failure") {
            Dialog.alert("Could not pin thread", String(Cause.squash(result.cause)));
            return false;
          }
        } else {
          if (lifecycle.unpin && !(await unpinThread(thread))) return false;
          if (lifecycle.unsettle && !(await unsettleThread(thread))) return false;
          if (lifecycle.unsnooze && !(await unsnoozeThread(thread))) return false;
        }
      }
      for (const assignment of assignments) {
        if (
          crossSection &&
          section === "pinned" &&
          thread.pinnedAt == null &&
          assignment.id === scopedThreadKey(thread.machineId, thread.id)
        )
          continue;
        if (pending !== null && !pending.isPending()) return false;
        const target = shellByKey.get(assignment.id);
        if (target === undefined) continue;
        if (!checkThreadOperationPermission(target, "Could not move thread")) return false;
        ThreadUndo.invalidate("pin", scopedThreadKey(target.machineId, target.id));
        const result = await reorder({
          machineId: target.machineId,
          input: { threadId: target.id, orderKey: assignment.orderKey },
        });
        if (result._tag === "Failure") {
          const error = Cause.squash(result.cause);
          Dialog.alert(
            "Could not move thread",
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : "The thread could not be moved.",
          );
          return false;
        }
      }
      pending?.complete();
      return true;
    })();
    if (!moved) pending?.cancel();
    appAtomRegistry.set(threadDropBusyAtom, false);
    return moved;
  };

  const confirmDeleteThread = (thread: MachineThreadShell) =>
    confirmThreadDeletion(executeAction, thread);

  return {
    archiveThread,
    confirmDeleteThread,
    settleThread,
    snoozeThread,
    unsnoozeThread,
    unsettleThread,
    pinThread,
    unpinThread,
    setThreadAutoSettle,
    moveThread,
    renameThread,
    regenerateThreadTitle,
  };
}

export function useArchivedThreadListActions(
  onCompleted: (thread: MachineThreadShell) => void,
): {
  readonly unarchiveThread: (thread: MachineThreadShell) => void;
  readonly confirmDeleteThread: (thread: MachineThreadShell) => void;
} {
  const handleCompleted = (_action: ThreadListAction, thread: MachineThreadShell) => {
    onCompleted(thread);
  };
  const executeAction = useThreadActionExecutor(handleCompleted);
  const unarchiveThread = (thread: MachineThreadShell) => {
    void executeAction("unarchive", thread);
  };
  const confirmDeleteThread = (thread: MachineThreadShell) =>
    confirmThreadDeletion(executeAction, thread);

  return { unarchiveThread, confirmDeleteThread };
}
