import { useAtomValue } from "@effect/atom-react";
import {
  type ArchivedSnapshotEntry,
  createArchivedThreadSnapshotsAtomFamily,
  makeArchivedThreadsMachineKey,
} from "@vekrel/client-runtime/state/threads";
import type { MachineId } from "@vekrel/contracts";
import { useCallback, useMemo } from "react";

import { appAtomRegistry } from "../../state/atom-registry";
import { orchestrationMachine } from "../../state/orchestration";

function archivedSnapshotAtom(machineId: MachineId) {
  return orchestrationMachine.archivedShellSnapshot({
    machineId,
    input: {},
  });
}

const archivedSnapshotsAtom = createArchivedThreadSnapshotsAtomFamily({
  getSnapshotAtom: archivedSnapshotAtom,
  labelPrefix: "mobile:archived-thread-snapshots",
});

export function refreshArchivedThreadsForMachine(machineId: MachineId): void {
  appAtomRegistry.refresh(archivedSnapshotAtom(machineId));
}

export function useArchivedThreadSnapshots(machineIds: ReadonlyArray<MachineId>): {
  readonly snapshots: ReadonlyArray<ArchivedSnapshotEntry>;
  readonly error: string | null;
  readonly isLoading: boolean;
  readonly refresh: () => void;
} {
  const machineKey = useMemo(
    () => makeArchivedThreadsMachineKey(machineIds),
    [machineIds],
  );
  const result = useAtomValue(archivedSnapshotsAtom(machineKey));
  const refresh = useCallback(() => {
    for (const machineId of machineIds) {
      appAtomRegistry.refresh(archivedSnapshotAtom(machineId));
    }
  }, [machineIds]);

  return { ...result, refresh };
}
