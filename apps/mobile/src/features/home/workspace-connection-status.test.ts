import { describe, expect, it } from "vite-plus/test";

import type { WorkspaceState } from "../../state/workspaceModel";
import { workspaceConnectionStatusPresentation } from "./workspace-connection-status";

function workspaceState(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    isLoadingConnections: false,
    hasConnections: true,
    hasLoadedShellSnapshot: true,
    hasPendingShellSnapshot: false,
    hasSyncingConnectedMachine: false,
    hasReadyMachine: true,
    hasConnectingMachine: false,
    connectingMachines: [],
    connectionState: "connected",
    connectionError: null,
    shellSnapshotError: null,
    networkStatus: "online",
    ...overrides,
  };
}

describe("workspace connection status", () => {
  it.each([
    ["reconnecting", "Could not reach sleeping laptop"],
    ["error", "Could not reach sleeping laptop"],
  ] as const)(
    "keeps the brand while a secondary machine is %s (%s)",
    (connectionState, connectionError) => {
      const state = workspaceState({
        hasConnectingMachine: connectionState !== "error",
        hasPendingShellSnapshot: true,
        connectionError,
        connectingMachines:
          connectionState === "error"
            ? []
            : [
                {
                  machineId: "machine-2" as never,
                  machineLabel: "Sleeping laptop",
                  displayUrl: "",
                  isRelayManaged: false,
                  isEnabled: true,
                  connectionState,
                  connectionError,
                  connectionErrorTraceId: null,
                },
              ],
      });

      expect(workspaceConnectionStatusPresentation(state)).toBeNull();
    },
  );

  it("shows connected shell catch-up even while a secondary machine is unreachable", () => {
    const state = workspaceState({
      hasSyncingConnectedMachine: true,
      hasPendingShellSnapshot: true,
      hasConnectingMachine: true,
      connectionError: "Could not reach sleeping laptop",
      connectingMachines: [
        {
          machineId: "machine-2" as never,
          machineLabel: "Sleeping laptop",
          displayUrl: "",
          isRelayManaged: false,
          isEnabled: true,
          connectionState: "reconnecting",
          connectionError: "Could not reach sleeping laptop",
          connectionErrorTraceId: null,
        },
      ],
    });

    expect(workspaceConnectionStatusPresentation(state)).toEqual({
      label: "Syncing threads...",
      showsProgress: true,
    });
  });
});
