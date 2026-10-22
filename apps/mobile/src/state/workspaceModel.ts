import { type MachineShellSummary } from "@vekrel/client-runtime/state/shell";
import type { MachineId, ServerConfig } from "@vekrel/contracts";

import {
  type MachineConnectionPhase,
  type NetworkStatus,
} from "@vekrel/client-runtime/connection";

import type { MachineConnectionSummary as WorkspaceMachine } from "@vekrel/client-runtime/state/presentation";

export { projectMachineConnectionSummary as projectWorkspaceMachine } from "@vekrel/client-runtime/state/presentation";
export type { MachineConnectionSummary as WorkspaceMachine } from "@vekrel/client-runtime/state/presentation";

export interface WorkspaceConnectionState {
  readonly isLoadingConnections: boolean;
  readonly hasConnections: boolean;
  readonly hasReadyMachine: boolean;
  readonly hasConnectingMachine: boolean;
  readonly connectingMachines: ReadonlyArray<WorkspaceMachine>;
  readonly connectionState: MachineConnectionPhase;
  readonly connectionError: string | null;
  readonly networkStatus: NetworkStatus;
}

export interface WorkspaceState extends WorkspaceConnectionState {
  readonly hasLoadedShellSnapshot: boolean;
  readonly hasPendingShellSnapshot: boolean;
  readonly hasSyncingConnectedMachine: boolean;
  readonly shellSnapshotError: string | null;
}

function overallConnectionState(
  machines: ReadonlyArray<WorkspaceMachine>,
  networkStatus: NetworkStatus,
): MachineConnectionPhase {
  if (machines.length === 0) {
    return "available";
  }
  if (networkStatus === "offline") {
    return "offline";
  }
  if (machines.some((machine) => machine.connectionState === "connected")) {
    return "connected";
  }
  if (machines.some((machine) => machine.connectionState === "reconnecting")) {
    return "reconnecting";
  }
  if (machines.some((machine) => machine.connectionState === "connecting")) {
    return "connecting";
  }
  if (machines.some((machine) => machine.connectionState === "unsupported")) {
    return "unsupported";
  }
  if (machines.some((machine) => machine.connectionState === "error")) {
    return "error";
  }
  if (machines.some((machine) => machine.connectionState === "offline")) {
    return "offline";
  }
  return "available";
}

export function projectWorkspaceConnectionState(input: {
  readonly isReady: boolean;
  readonly networkStatus: NetworkStatus;
  readonly machines: ReadonlyArray<WorkspaceMachine>;
}): WorkspaceConnectionState {
  const activeMachines = input.machines.filter((machine) => machine.isEnabled);
  const connectingMachines = activeMachines.filter(
    (machine) =>
      machine.connectionState === "connecting" ||
      machine.connectionState === "reconnecting",
  );

  return {
    isLoadingConnections: !input.isReady,
    hasConnections: input.machines.length > 0,
    hasReadyMachine:
      input.networkStatus !== "offline" &&
      activeMachines.some((machine) => machine.connectionState === "connected"),
    hasConnectingMachine: connectingMachines.length > 0,
    connectingMachines,
    connectionState: overallConnectionState(activeMachines, input.networkStatus),
    connectionError:
      activeMachines.find((machine) => machine.connectionError !== null)
        ?.connectionError ?? null,
    networkStatus: input.networkStatus,
  };
}

export function projectWorkspaceState(input: {
  readonly isReady: boolean;
  readonly networkStatus: NetworkStatus;
  readonly machines: ReadonlyArray<WorkspaceMachine>;
  readonly shellSummary: MachineShellSummary;
  readonly hasSyncingConnectedMachine: boolean;
}): WorkspaceState {
  return {
    ...projectWorkspaceConnectionState(input),
    hasLoadedShellSnapshot: input.shellSummary.hasSnapshot,
    hasPendingShellSnapshot: input.shellSummary.hasSynchronizingShell,
    hasSyncingConnectedMachine: input.hasSyncingConnectedMachine,
    shellSnapshotError: input.shellSummary.firstError,
  };
}

export type ServerConfigByMachineId = ReadonlyMap<MachineId, ServerConfig>;
