import type { MachineShellSummary } from "@vekrel/client-runtime/state/shell";
import {
  BearerConnectionProfile,
  BearerConnectionTarget,
} from "@vekrel/client-runtime/connection";
import { MachineId } from "@vekrel/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";

import { projectWorkspaceMachine, projectWorkspaceState } from "./workspaceModel";
import type { MachinePresentation } from "./machines";

const MACHINE_ID = MachineId.make("machine-1");

function machine(
  phase: MachinePresentation["connection"]["phase"],
): MachinePresentation {
  const connectionId = `bearer:${MACHINE_ID}`;
  return {
    machineId: MACHINE_ID,
    label: "Julius's MacBook Pro",
    displayUrl: "https://machine.example.test",
    relayManaged: false,
    entry: {
      target: new BearerConnectionTarget({
        machineId: MACHINE_ID,
        label: "Julius's MacBook Pro",
        connectionId,
      }),
      profile: Option.some(
        new BearerConnectionProfile({
          connectionId,
          machineId: MACHINE_ID,
          label: "Julius's MacBook Pro",
          httpBaseUrl: "https://machine.example.test",
          wsBaseUrl: "wss://machine.example.test",
        }),
      ),
      enabled: true,
    },
    connection: {
      phase,
      error: phase === "error" ? "Connection failed." : null,
      traceId: phase === "error" ? "trace-1" : null,
    },
    serverConfig: null,
  };
}

const EMPTY_SHELL_SUMMARY: MachineShellSummary = {
  hasSnapshot: false,
  hasSynchronizingShell: false,
  hasCachedShell: false,
  hasLiveShell: false,
  firstError: null,
};

const CACHED_SHELL_SUMMARY: MachineShellSummary = {
  ...EMPTY_SHELL_SUMMARY,
  hasSnapshot: true,
  hasSynchronizingShell: true,
  hasCachedShell: true,
};

describe("mobile workspace projection", () => {
  it("reports offline before stale connected presentations", () => {
    const machines = [projectWorkspaceMachine(MACHINE_ID, machine("connected"))];
    const state = projectWorkspaceState({
      isReady: true,
      networkStatus: "offline",
      machines,
      shellSummary: EMPTY_SHELL_SUMMARY,
      hasSyncingConnectedMachine: false,
    });

    expect(state.connectionState).toBe("offline");
    expect(state.networkStatus).toBe("offline");
    expect(state.hasReadyMachine).toBe(false);
  });

  it("keeps retained snapshots visible while reconnecting without claiming readiness", () => {
    const machines = [projectWorkspaceMachine(MACHINE_ID, machine("reconnecting"))];
    const state = projectWorkspaceState({
      isReady: true,
      networkStatus: "online",
      machines,
      shellSummary: CACHED_SHELL_SUMMARY,
      hasSyncingConnectedMachine: false,
    });

    expect(state.hasLoadedShellSnapshot).toBe(true);
    expect(state.hasPendingShellSnapshot).toBe(true);
    expect(state.hasSyncingConnectedMachine).toBe(false);
    expect(state.hasReadyMachine).toBe(false);
    expect(state.connectionState).toBe("reconnecting");
  });
});
