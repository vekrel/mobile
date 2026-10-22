import { useCallback, useEffect, useEffectEvent, useMemo } from "react";

import { MachineProject, MachineThreadShell } from "@vekrel/client-runtime/state/shell";
import type { AtomCommandResult } from "@vekrel/client-runtime/state/runtime";
import {
  type GitActionRequestInput,
  type VcsActionOperation,
  type VcsRef,
} from "@vekrel/client-runtime/state/vcs";
import {
  AuthOrchestrationOperateScope,
  AuthSourceControlWriteScope,
  MachineAuthorizationError,
  type GitRunStackedActionResult,
} from "@vekrel/contracts";
import {
  dedupeRemoteBranchesWithLocalMatches,
  sanitizeFeatureBranchName,
} from "@vekrel/shared/git";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";

import { useBranches } from "../state/queries";
import { threadMachine } from "../state/threads";
import { vcsActionManager, vcsMachine } from "../state/vcs";
import { uuidv4 } from "../lib/uuid";
import { appAtomRegistry } from "./atom-registry";
import { readMachineScope, useMachineScope } from "./session";
import { setPendingConnectionError } from "./use-remote-machine-registry";
import { useAtomCommand } from "./use-atom-command";
import { showGitActionResult } from "./use-vcs-action-state";
import { useThreadSelection } from "./use-thread-selection";
import { useSelectedThreadWorktree } from "./use-selected-thread-worktree";

export function useSelectedThreadGitActions() {
  const updateThreadMetadata = useAtomCommand(threadMachine.updateMetadata, {
    reportFailure: false,
  });
  const refreshStatus = useAtomCommand(vcsMachine.refreshStatus, { reportFailure: false });
  const switchRef = useAtomCommand(vcsMachine.switchRef, { reportFailure: false });
  const createRef = useAtomCommand(vcsMachine.createRef, { reportFailure: false });
  const createWorktree = useAtomCommand(vcsMachine.createWorktree, { reportFailure: false });
  const pull = useAtomCommand(vcsMachine.pull, { reportFailure: false });
  const { selectedThread, selectedThreadProject, selectedMachineRuntime } =
    useThreadSelection();
  const canWriteSourceControl = useMachineScope(
    selectedThread?.machineId ?? null,
    AuthSourceControlWriteScope,
  );
  const canOperateThread = useMachineScope(
    selectedThread?.machineId ?? null,
    AuthOrchestrationOperateScope,
  );
  const canChangeThreadBranch = canWriteSourceControl && canOperateThread;
  const { selectedThreadCwd, selectedThreadWorktreePath } = useSelectedThreadWorktree();
  const runStackedAction = useAtomCommand(
    vcsActionManager.runStackedAction({
      machineId: selectedThread?.machineId ?? null,
      cwd: selectedThreadCwd,
    }),
    { reportFailure: false },
  );

  const selectedThreadGitRootCwd = selectedThreadProject?.workspaceRoot ?? null;
  const branchTarget = useMemo(
    () => ({
      machineId: selectedThread?.machineId ?? null,
      cwd: selectedThreadGitRootCwd,
      query: null,
    }),
    [selectedThread?.machineId, selectedThreadGitRootCwd],
  );
  const branchState = useBranches(branchTarget);
  const updateThreadGitContext = useCallback(
    async (
      thread: NonNullable<typeof selectedThread>,
      nextState: {
        readonly branch?: string | null;
        readonly worktreePath?: string | null;
      },
    ) => {
      if (!readMachineScope(thread.machineId, AuthOrchestrationOperateScope)) {
        return AsyncResult.failure<never, MachineAuthorizationError>(
          Cause.fail(
            new MachineAuthorizationError({
              requiredScope: AuthOrchestrationOperateScope,
              message: "This connection cannot update the thread's branch.",
            }),
          ),
        );
      }
      return updateThreadMetadata({
        machineId: thread.machineId,
        input: {
          threadId: thread.id,
          ...(nextState.branch !== undefined ? { branch: nextState.branch } : {}),
          ...(nextState.worktreePath !== undefined ? { worktreePath: nextState.worktreePath } : {}),
        },
      });
    },
    [updateThreadMetadata],
  );

  const refreshSelectedThreadGitStatus = useCallback(
    async (options?: { readonly quiet?: boolean; readonly cwd?: string | null }) => {
      if (!selectedThread || !selectedThreadProject) {
        return null;
      }

      const cwd = options?.cwd ?? selectedThreadCwd;
      if (!cwd) {
        return null;
      }

      const target = { machineId: selectedThread.machineId, cwd };
      const execute = () =>
        refreshStatus({
          machineId: selectedThread.machineId,
          input: { cwd },
        });
      const result = options?.quiet
        ? await execute()
        : await vcsActionManager.track(
            appAtomRegistry,
            target,
            {
              operation: "refresh_status",
              label: "Refreshing source control status",
            },
            execute,
          );
      if (AsyncResult.isFailure(result)) {
        const error = Cause.squash(result.cause);
        const message = error instanceof Error ? error.message : "Failed to refresh git status.";
        setPendingConnectionError(message);
        return null;
      }
      setPendingConnectionError(null);
      return result.value;
    },
    [refreshStatus, selectedThread, selectedThreadCwd, selectedThreadProject],
  );

  // Shell updates replace the selected thread object many times per second while a
  // turn streams, so key the refresh on primitives.
  const selectedMachineId = selectedThread?.machineId ?? null;
  const selectedThreadId = selectedThread?.id ?? null;
  const hasSelectedThreadProject = selectedThreadProject !== null;
  const isMachineConnected = selectedMachineRuntime?.connectionState === "connected";
  const refreshOnSelection = useEffectEvent(() => {
    void refreshSelectedThreadGitStatus({ quiet: true });
  });
  useEffect(() => {
    if (
      selectedMachineId === null ||
      selectedThreadId === null ||
      !hasSelectedThreadProject ||
      selectedThreadCwd === null ||
      !isMachineConnected
    ) {
      return;
    }
    refreshOnSelection();
  }, [
    selectedMachineId,
    selectedThreadId,
    hasSelectedThreadProject,
    selectedThreadCwd,
    isMachineConnected,
  ]);

  const runSelectedThreadGitMutation = useCallback(
    async <T, E>(
      operation: VcsActionOperation,
      label: string,
      execute: (input: {
        readonly thread: MachineThreadShell;
        readonly project: MachineProject;
        readonly cwd: string;
      }) => Promise<AtomCommandResult<T, E>>,
      options?: { readonly managedExternally?: boolean; readonly changesThreadBranch?: boolean },
    ): Promise<T | null> => {
      if (
        !selectedThread ||
        !selectedThreadProject ||
        !selectedThreadCwd ||
        !readMachineScope(selectedThread.machineId, AuthSourceControlWriteScope) ||
        (options?.changesThreadBranch === true &&
          !readMachineScope(selectedThread.machineId, AuthOrchestrationOperateScope))
      ) {
        return null;
      }

      const target = {
        machineId: selectedThread.machineId,
        cwd: selectedThreadCwd,
      };
      setPendingConnectionError(null);
      const run = () =>
        execute({
          thread: selectedThread,
          project: selectedThreadProject,
          cwd: selectedThreadCwd,
        });
      const result =
        options?.managedExternally === true
          ? await run()
          : await vcsActionManager.track(appAtomRegistry, target, { operation, label }, run);
      if (AsyncResult.isFailure(result)) {
        const error = Cause.squash(result.cause);
        const message = error instanceof Error ? error.message : "Git action failed.";
        setPendingConnectionError(message);
        showGitActionResult({ type: "error", title: "Git action failed", description: message });
        return null;
      }
      return result.value;
    },
    [selectedThread, selectedThreadCwd, selectedThreadProject],
  );

  const refreshSelectedThreadBranches = useCallback(async (): Promise<ReadonlyArray<VcsRef>> => {
    branchState.refresh();
    return dedupeRemoteBranchesWithLocalMatches(branchState.data?.refs ?? []).filter(
      (branch) => !branch.isRemote,
    );
  }, [branchState]);

  const syncSelectedThreadBranchState = useCallback(
    async (input: {
      readonly thread: MachineThreadShell;
      readonly cwd: string;
      readonly nextThreadState?: {
        readonly branch?: string | null;
        readonly worktreePath?: string | null;
      };
    }): Promise<AtomCommandResult<void, unknown>> => {
      // The Git mutation already landed; refresh what the worktree shows even
      // when the thread metadata update is denied, so the sheet does not keep
      // displaying the previous branch.
      const updateResult = input.nextThreadState
        ? await updateThreadGitContext(input.thread, input.nextThreadState)
        : AsyncResult.success(undefined);
      branchState.refresh();
      await refreshSelectedThreadGitStatus({ quiet: true, cwd: input.cwd });
      return AsyncResult.isFailure(updateResult)
        ? AsyncResult.failure(updateResult.cause)
        : AsyncResult.success(undefined);
    },
    [branchState, refreshSelectedThreadGitStatus, updateThreadGitContext],
  );

  const onCheckoutSelectedThreadBranch = useCallback(
    async (branch: string) => {
      return runSelectedThreadGitMutation(
        "switch_ref",
        "Switching branch",
        async ({ thread, cwd }) => {
          const result = await switchRef({
            machineId: thread.machineId,
            input: { cwd, refName: branch },
          });
          if (AsyncResult.isFailure(result)) {
            return result;
          }
          const syncResult = await syncSelectedThreadBranchState({
            thread,
            cwd,
            nextThreadState: {
              branch: result.value.refName ?? thread.branch,
              worktreePath: selectedThreadWorktreePath,
            },
          });
          return AsyncResult.isFailure(syncResult) ? AsyncResult.failure(syncResult.cause) : result;
        },
        { changesThreadBranch: true },
      );
    },
    [
      runSelectedThreadGitMutation,
      selectedThreadWorktreePath,
      syncSelectedThreadBranchState,
      switchRef,
    ],
  );

  const onCreateSelectedThreadBranch = useCallback(
    async (branch: string) => {
      return runSelectedThreadGitMutation(
        "create_ref",
        "Creating branch",
        async ({ thread, cwd }) => {
          const result = await createRef({
            machineId: thread.machineId,
            input: { cwd, refName: branch, switchRef: true },
          });
          if (AsyncResult.isFailure(result)) {
            return result;
          }
          const syncResult = await syncSelectedThreadBranchState({
            thread,
            cwd,
            nextThreadState: {
              branch: result.value.refName ?? thread.branch,
              worktreePath: selectedThreadWorktreePath,
            },
          });
          return AsyncResult.isFailure(syncResult) ? AsyncResult.failure(syncResult.cause) : result;
        },
        { changesThreadBranch: true },
      );
    },
    [
      runSelectedThreadGitMutation,
      selectedThreadWorktreePath,
      syncSelectedThreadBranchState,
      createRef,
    ],
  );

  const onCreateSelectedThreadWorktree = useCallback(
    async (nextWorktree: { readonly baseBranch: string; readonly newBranch: string }) => {
      return runSelectedThreadGitMutation(
        "create_worktree",
        "Creating worktree",
        async ({ thread, project }) => {
          const result = await createWorktree({
            machineId: thread.machineId,
            input: {
              cwd: project.workspaceRoot,
              refName: nextWorktree.baseBranch,
              newRefName: sanitizeFeatureBranchName(nextWorktree.newBranch),
              path: null,
            },
          });
          if (AsyncResult.isFailure(result)) {
            return result;
          }
          const syncResult = await syncSelectedThreadBranchState({
            thread,
            cwd: result.value.worktree.path,
            nextThreadState: {
              branch: result.value.worktree.refName,
              worktreePath: result.value.worktree.path,
            },
          });
          return AsyncResult.isFailure(syncResult) ? AsyncResult.failure(syncResult.cause) : result;
        },
        { changesThreadBranch: true },
      );
    },
    [createWorktree, runSelectedThreadGitMutation, syncSelectedThreadBranchState],
  );

  const onPullSelectedThreadBranch = useCallback(async () => {
    await runSelectedThreadGitMutation(
      "pull",
      "Pulling latest changes",
      async ({ thread, cwd }) => {
        const result = await pull({
          machineId: thread.machineId,
          input: { cwd },
        });
        if (AsyncResult.isFailure(result)) {
          return result;
        }
        await refreshSelectedThreadGitStatus({ quiet: true, cwd });
        showGitActionResult({
          type: "success",
          title:
            result.value.status === "skipped_up_to_date"
              ? "Already up to date"
              : `Pulled latest on ${result.value.refName}`,
        });
        return result;
      },
    );
  }, [pull, refreshSelectedThreadGitStatus, runSelectedThreadGitMutation]);

  const onRunSelectedThreadGitAction = useCallback(
    async (input: GitActionRequestInput): Promise<GitRunStackedActionResult | null> => {
      const actionId = uuidv4();
      return await runSelectedThreadGitMutation(
        "run_change_request",
        "Running source control action",
        async ({ thread, cwd }) => {
          const result = await runStackedAction({
            actionId,
            action: input.action,
            ...(input.commitMessage ? { commitMessage: input.commitMessage } : {}),
            ...(input.featureBranch ? { featureBranch: input.featureBranch } : {}),
            ...(input.filePaths?.length ? { filePaths: [...input.filePaths] } : {}),
            threadId: thread.id,
          });
          if (AsyncResult.isFailure(result)) {
            return result;
          }

          if (result.value.branch.status === "created" && result.value.branch.name) {
            const syncResult = await syncSelectedThreadBranchState({
              thread,
              cwd,
              nextThreadState: {
                branch: result.value.branch.name,
                worktreePath: selectedThreadWorktreePath,
              },
            });
            if (AsyncResult.isFailure(syncResult)) {
              return AsyncResult.failure(syncResult.cause);
            }
          } else {
            await refreshSelectedThreadGitStatus({ quiet: true, cwd });
          }
          showGitActionResult({
            type: "success",
            title: result.value.toast.title,
            description: result.value.toast.description,
            prUrl:
              result.value.toast.cta.kind === "open_pr" ? result.value.toast.cta.url : undefined,
          });
          return result;
        },
        { managedExternally: true, changesThreadBranch: input.featureBranch === true },
      );
    },
    [
      runStackedAction,
      refreshSelectedThreadGitStatus,
      runSelectedThreadGitMutation,
      selectedThreadWorktreePath,
      syncSelectedThreadBranchState,
    ],
  );

  return {
    canWriteSourceControl,
    canChangeThreadBranch,
    refreshSelectedThreadGitStatus,
    refreshSelectedThreadBranches,
    onCheckoutSelectedThreadBranch,
    onCreateSelectedThreadBranch,
    onCreateSelectedThreadWorktree,
    onPullSelectedThreadBranch,
    onRunSelectedThreadGitAction,
  };
}
