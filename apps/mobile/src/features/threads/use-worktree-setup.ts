import type { MachineId, ThreadId, WorktreeSetupSnapshot } from "@vekrel/contracts";
import { resolveVisibleWorktreeSetup } from "@vekrel/client-runtime/worktree-setup";
import { useEffect, useState } from "react";
import { useMachineQuery } from "../../state/query";
import { vcsMachine } from "../../state/vcs";
import { resolveWorktreeSetupSnapshot } from "./worktree-setup-state";

export function useWorktreeSetup(input: {
  machineId: MachineId | null;
  threadId: ThreadId | null;
  preparing: boolean;
  turnStarted: boolean;
  followUpSent: boolean;
}) {
  const key = JSON.stringify([input.machineId, input.threadId]);
  const [held, setHeld] = useState<{ key: string; snapshot: WorktreeSetupSnapshot } | null>(null);
  const live = held?.key === key ? held.snapshot : null;
  const query = useMachineQuery(
    input.machineId &&
      input.threadId &&
      (live?.phase === "running" || (!live && input.preparing))
      ? vcsMachine.worktreeSetup({
          machineId: input.machineId,
          input: { threadId: input.threadId },
        })
      : null,
  );
  const snapshot = resolveWorktreeSetupSnapshot(input.threadId, query.data, live);
  useEffect(() => {
    if (snapshot && snapshot !== live) setHeld({ key, snapshot });
  }, [key, live, snapshot]);
  return {
    snapshot,
    visible: resolveVisibleWorktreeSetup({
      live: snapshot,
      recorded: null,
      turnStarted: input.turnStarted,
      followUpSent: input.followUpSent,
    }),
  };
}
