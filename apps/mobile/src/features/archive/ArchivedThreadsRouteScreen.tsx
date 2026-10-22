import type { MachineId } from "@vekrel/contracts";
import * as Arr from "effect/Array";
import * as Order from "effect/Order";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";

import { useSavedRemoteConnections } from "../../state/use-remote-machine-registry";
import { useArchivedThreadListActions } from "../home/useThreadListActions";
import {
  ArchivedThreadsScreen,
  type ArchivedThreadsHeaderMachine,
} from "./ArchivedThreadsScreen";
import { buildArchivedThreadGroups, type ArchivedThreadSortOrder } from "./archivedThreadList";
import {
  refreshArchivedThreadsForMachine,
  useArchivedThreadSnapshots,
} from "./useArchivedThreadSnapshots";

export function ArchivedThreadsRouteScreen() {
  const { savedConnectionsById } = useSavedRemoteConnections();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMachineId, setSelectedMachineId] = useState<MachineId | null>(null);
  const [sortOrder, setSortOrder] = useState<ArchivedThreadSortOrder>("newest");
  const machines = useMemo<ReadonlyArray<ArchivedThreadsHeaderMachine>>(
    () =>
      Arr.sort(
        Object.values(savedConnectionsById).map((connection) => ({
          machineId: connection.machineId,
          label: connection.machineLabel,
        })),
        Order.mapInput(Order.String, (machine: ArchivedThreadsHeaderMachine) =>
          machine.label.toLocaleLowerCase(),
        ),
      ),
    [savedConnectionsById],
  );
  const machineIds = useMemo(
    () => machines.map((machine) => machine.machineId),
    [machines],
  );
  const machineLabels = useMemo(
    () =>
      Object.fromEntries(
        machines.map((machine) => [machine.machineId, machine.label]),
      ),
    [machines],
  );
  const { error, isLoading, refresh, snapshots } = useArchivedThreadSnapshots(machineIds);
  const groups = useMemo(
    () =>
      buildArchivedThreadGroups({
        snapshots,
        machineLabels,
        machineId: selectedMachineId,
        searchQuery,
        sortOrder,
      }),
    [machineLabels, searchQuery, selectedMachineId, snapshots, sortOrder],
  );
  const refreshChangedMachine = useCallback(
    (thread: { readonly machineId: MachineId }) => {
      refreshArchivedThreadsForMachine(thread.machineId);
    },
    [],
  );
  const { unarchiveThread, confirmDeleteThread } =
    useArchivedThreadListActions(refreshChangedMachine);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <ArchivedThreadsScreen
      machines={machines}
      error={error}
      groups={groups}
      isLoading={isLoading}
      onDeleteThread={confirmDeleteThread}
      onMachineChange={setSelectedMachineId}
      onRefresh={refresh}
      onSearchQueryChange={setSearchQuery}
      onSortOrderChange={setSortOrder}
      onUnarchiveThread={unarchiveThread}
      searchQuery={searchQuery}
      selectedMachineId={selectedMachineId}
      sortOrder={sortOrder}
    />
  );
}
