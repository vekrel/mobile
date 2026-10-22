import { useAtomValue } from "@effect/atom-react";
import { useMemo } from "react";
import { Atom } from "effect/reactivity";

import { machineShell, machineShellSummaryAtom } from "./shell";
import { projectWorkspaceState } from "./workspaceModel";
import { machineCatalog } from "../connection/catalog";
import { machinePresentations } from "./presentation";
import { createWorkspaceConnectionAtoms } from "./workspace-connection-atoms";

export const workspaceConnections = createWorkspaceConnectionAtoms({
  catalogValueAtom: machineCatalog.catalogValueAtom,
  networkStatusValueAtom: machineCatalog.networkStatusValueAtom,
  presentationAtom: machinePresentations.presentationAtom,
});

// A disconnected machine's retries also leave its shell synchronizing.
const hasSyncingConnectedMachineAtom = Atom.make((get) =>
  get(workspaceConnections.machinesAtom).some(
    (machine) =>
      machine.isEnabled &&
      machine.connectionState === "connected" &&
      get(machineShell.stateValueAtom(machine.machineId)).status === "synchronizing",
  ),
).pipe(Atom.withLabel("mobile:has-syncing-connected-machine"));

export function useWorkspaceMachines() {
  return useAtomValue(workspaceConnections.machinesAtom);
}

export function useWorkspaceConnectionState() {
  return useAtomValue(workspaceConnections.stateAtom);
}

export function useConnectionsReady() {
  return useAtomValue(workspaceConnections.isReadyAtom);
}

export function useWorkspaceState() {
  const isReady = useConnectionsReady();
  const networkStatus = useAtomValue(machineCatalog.networkStatusValueAtom);
  const projectedMachines = useWorkspaceMachines();
  const shellSummary = useAtomValue(machineShellSummaryAtom);
  const hasSyncingConnectedMachine = useAtomValue(hasSyncingConnectedMachineAtom);
  const state = useMemo(
    () =>
      projectWorkspaceState({
        isReady,
        networkStatus,
        machines: projectedMachines,
        shellSummary,
        hasSyncingConnectedMachine,
      }),
    [isReady, networkStatus, projectedMachines, shellSummary, hasSyncingConnectedMachine],
  );

  return {
    machines: projectedMachines,
    state,
  };
}
