import { useMemo } from "react";

import { dedupeRemoteBranchesWithLocalMatches } from "@vekrel/shared/git";

import { useBranches } from "./queries";
import { useMachineQuery } from "./query";
import { sourceControlMachine } from "./sourceControl";
import { useVcsActionState } from "./use-vcs-action-state";
import { useThreadSelection } from "./use-thread-selection";
import { useSelectedThreadWorktree } from "./use-selected-thread-worktree";

export function useSelectedThreadGitState() {
  const { selectedThread, selectedThreadProject } = useThreadSelection();
  const { selectedThreadCwd } = useSelectedThreadWorktree();

  const selectedThreadGitTarget = useMemo(
    () => ({
      machineId: selectedThread?.machineId ?? null,
      cwd: selectedThreadCwd,
    }),
    [selectedThread?.machineId, selectedThreadCwd],
  );
  const gitActionState = useVcsActionState(selectedThreadGitTarget);
  const sourceControlDiscovery = useMachineQuery(
    selectedThread === null
      ? null
      : sourceControlMachine.discovery({
          machineId: selectedThread.machineId,
          input: {},
        }),
  );

  const selectedThreadBranchTarget = useMemo(
    () => ({
      machineId: selectedThread?.machineId ?? null,
      cwd: selectedThreadProject?.workspaceRoot ?? null,
      query: null,
    }),
    [selectedThread?.machineId, selectedThreadProject?.workspaceRoot],
  );
  const selectedThreadBranchState = useBranches(selectedThreadBranchTarget);
  const selectedThreadBranches = useMemo(
    () =>
      dedupeRemoteBranchesWithLocalMatches(selectedThreadBranchState.data?.refs ?? []).filter(
        (branch) => !branch.isRemote,
      ),
    [selectedThreadBranchState.data?.refs],
  );

  return {
    gitOperationLabel: gitActionState.currentLabel,
    sourceControlDiscovery,
    selectedThreadBranches,
    selectedThreadBranchesLoading: selectedThreadBranchState.isPending,
  };
}
