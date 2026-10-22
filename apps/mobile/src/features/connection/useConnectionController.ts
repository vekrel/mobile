import { useAtomValue } from "@effect/atom-react";
import {
  RelayConnectionRegistration,
  RelayConnectionTarget,
} from "@vekrel/client-runtime/connection";
import type { MachineId } from "@vekrel/contracts";
import type {
  RelayClientMachineRecord,
  RelayMachineStatusResponse,
} from "@vekrel/contracts/relay";
import * as Option from "effect/Option";
import { useCallback, useMemo } from "react";

import { machineCatalog } from "../../connection/catalog";
import {
  connectPairingUrl as connectPairingUrlAtom,
  updateBearerConnection,
} from "../../connection/onboarding";
import { useWorkspaceMachines } from "../../state/workspace";
import { relayMachineDiscovery } from "../../state/relay";
import { useAtomCommand } from "../../state/use-atom-command";
import { relayManagedMachineIds } from "./machineSections";

export interface RelayMachineView {
  readonly machine: RelayClientMachineRecord;
  readonly availability: "checking" | "online" | "offline" | "error";
  readonly status: RelayMachineStatusResponse | null;
  readonly error: string | null;
  readonly traceId: string | null;
}

export function useConnectionController() {
  const connectedMachines = useWorkspaceMachines();
  const discovery = useAtomValue(relayMachineDiscovery.stateValueAtom);
  const connectPairingUrlMutation = useAtomCommand(connectPairingUrlAtom, {
    reportFailure: false,
  });
  const updateBearer = useAtomCommand(updateBearerConnection, { reportFailure: false });
  const registerMachine = useAtomCommand(machineCatalog.register, "machine register");
  const removeMachineMutation = useAtomCommand(machineCatalog.remove, "machine remove");
  const retryMachineMutation = useAtomCommand(machineCatalog.retryNow, "machine retry");
  const setMachineEnabledMutation = useAtomCommand(
    machineCatalog.setEnabled,
    "machine toggle",
  );
  const refreshRelayMachines = useAtomCommand(
    relayMachineDiscovery.refresh,
    "relay machine refresh",
  );

  const registeredIds = useMemo(
    () => relayManagedMachineIds(connectedMachines),
    [connectedMachines],
  );
  const relayMachines = useMemo<ReadonlyArray<RelayMachineView>>(
    () =>
      [...discovery.machines.values()].map((entry) => ({
        machine: entry.machine,
        availability: entry.availability,
        status: Option.getOrNull(entry.status),
        error: Option.getOrNull(entry.error)?.message ?? null,
        traceId: Option.getOrNull(entry.error)?.traceId ?? null,
      })),
    [discovery.machines],
  );
  const availableRelayMachines = useMemo(
    () => relayMachines.filter((entry) => !registeredIds.has(entry.machine.machineId)),
    [registeredIds, relayMachines],
  );

  const connectPairingUrl = useCallback(
    (pairingUrl: string, expectedMachineId?: MachineId) =>
      connectPairingUrlMutation({
        pairingUrl,
        ...(expectedMachineId === undefined ? {} : { expectedMachineId }),
      }),
    [connectPairingUrlMutation],
  );
  const connectRelayMachine = useCallback(
    (machine: RelayClientMachineRecord) =>
      registerMachine(
        new RelayConnectionRegistration({
          target: new RelayConnectionTarget({
            machineId: machine.machineId,
            label: machine.label,
          }),
        }),
      ),
    [registerMachine],
  );
  const removeMachine = useCallback(
    (machineId: MachineId) => removeMachineMutation(machineId),
    [removeMachineMutation],
  );
  const retryMachine = useCallback(
    (machineId: MachineId) => retryMachineMutation(machineId),
    [retryMachineMutation],
  );
  const setMachineEnabled = useCallback(
    (machineId: MachineId, enabled: boolean) =>
      setMachineEnabledMutation({ machineId, enabled }),
    [setMachineEnabledMutation],
  );
  const updateMachine = useCallback(
    (
      machineId: MachineId,
      updates: { readonly label: string; readonly displayUrl: string },
    ) =>
      updateBearer({
        machineId,
        label: updates.label,
        httpBaseUrl: updates.displayUrl,
      }),
    [updateBearer],
  );

  return {
    connectedMachines,
    relayMachines,
    availableRelayMachines,
    relayDiscovery: {
      isRefreshing: discovery.refreshing,
      isOffline: discovery.offline,
      error: Option.getOrNull(discovery.error)?.message ?? null,
      errorTraceId: Option.getOrNull(discovery.error)?.traceId ?? null,
    },
    connectPairingUrl,
    connectRelayMachine,
    removeMachine,
    retryMachine,
    setMachineEnabled,
    updateMachine,
    refreshRelayMachines,
  };
}
