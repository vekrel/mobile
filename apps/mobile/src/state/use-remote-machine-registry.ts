import * as Dialog from "../components/ui/Dialog";
import { useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import type { MachineId } from "@vekrel/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom } from "effect/reactivity";
import { useCallback } from "react";

import { useConnectionController } from "../features/connection/useConnectionController";
import { machinePresentations } from "./presentation";
import { useWorkspaceConnectionState, useWorkspaceMachines } from "./workspace";
import type { SavedRemoteConnection } from "../lib/connection";
import { appAtomRegistry } from "./atom-registry";
import type { ConnectedMachineSummary, MachineRuntimeState } from "./remote-runtime-types";
import { machineSession } from "./session";
import { machineCatalog } from "../connection/catalog";
import { createRemoteMachineProjectionAtoms } from "./remote-machine-projections";
import { serverMachine } from "./server";

const connectionPairingUrlAtom = Atom.make("").pipe(
  Atom.keepAlive,
  Atom.withLabel("mobile:connection-pairing-url"),
);

const pendingConnectionErrorAtom = Atom.make<string | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("mobile:pending-connection-error"),
);

export function setPendingConnectionError(message: string | null): void {
  appAtomRegistry.set(pendingConnectionErrorAtom, message);
}

const remoteMachineProjections = createRemoteMachineProjectionAtoms({
  presentationAtom: machinePresentations.presentationAtom,
  preparedConnectionAtom: machineSession.preparedConnectionValueAtom,
  serverConfigAtom: serverMachine.configValueAtom,
});

const EMPTY_SAVED_CONNECTION_ATOM = Atom.make<SavedRemoteConnection | null>(null).pipe(
  Atom.withLabel("mobile:saved-connection:empty"),
);

const EMPTY_RUNTIME_STATE_ATOM = Atom.make<MachineRuntimeState | null>(null).pipe(
  Atom.withLabel("mobile:machine-runtime-state:empty"),
);

const savedConnectionsByIdAtom = Atom.make((get) => {
  const catalog = get(machineCatalog.catalogValueAtom);
  return Object.fromEntries(
    [...catalog.entries.keys()].flatMap((machineId) => {
      const connection = get(remoteMachineProjections.savedConnectionAtom(machineId));
      return connection === null ? [] : [[machineId, connection]];
    }),
  ) as Record<MachineId, SavedRemoteConnection>;
}).pipe(Atom.withLabel("mobile:saved-connections-by-id"));

export function useSavedRemoteConnections() {
  const catalog = useAtomValue(machineCatalog.catalogValueAtom);
  const savedConnectionsById = useAtomValue(savedConnectionsByIdAtom);

  return {
    isLoadingSavedConnection: !catalog.isReady,
    savedConnectionsById,
  };
}

export function useSavedRemoteConnection(
  machineId: MachineId | null,
): SavedRemoteConnection | null {
  return useAtomValue(
    machineId === null
      ? EMPTY_SAVED_CONNECTION_ATOM
      : remoteMachineProjections.savedConnectionAtom(machineId),
  );
}

export function useRemoteMachineRuntime(
  machineId: MachineId | null,
): MachineRuntimeState | null {
  return useAtomValue(
    machineId === null
      ? EMPTY_RUNTIME_STATE_ATOM
      : remoteMachineProjections.runtimeStateAtom(machineId),
  );
}

export function useRemoteConnectionStatus() {
  const state = useWorkspaceConnectionState();
  const connectedMachines: ReadonlyArray<ConnectedMachineSummary> =
    useWorkspaceMachines();
  const pendingConnectionError = useAtomValue(pendingConnectionErrorAtom);

  return {
    connectedMachines,
    connectionState: state.connectionState,
    connectionError: pendingConnectionError ?? state.connectionError,
  };
}

export function useRemoteConnections() {
  const controller = useConnectionController();
  const navigation = useNavigation();
  const connectionPairingUrl = useAtomValue(connectionPairingUrlAtom);
  const pendingConnectionError = useAtomValue(pendingConnectionErrorAtom);
  const { connectedMachines, connectionError, connectionState } = useRemoteConnectionStatus();

  const onChangeConnectionPairingUrl = useCallback((pairingUrl: string) => {
    appAtomRegistry.set(connectionPairingUrlAtom, pairingUrl);
  }, []);

  const onConnectPress = useCallback(
    async (pairingUrl?: string, expectedMachineId?: MachineId) => {
      const nextPairingUrl = pairingUrl ?? connectionPairingUrl;
      setPendingConnectionError(null);
      const result = await controller.connectPairingUrl(nextPairingUrl, expectedMachineId);
      if (AsyncResult.isFailure(result)) {
        const error = Cause.squash(result.cause);
        const message =
          error instanceof Error ? error.message : "Failed to pair with the machine.";
        if (
          error !== null &&
          typeof error === "object" &&
          "reason" in error &&
          error.reason === "unsupported"
        ) {
          Dialog.alert("Client not supported", message);
        } else {
          setPendingConnectionError(message);
        }
      } else {
        appAtomRegistry.set(connectionPairingUrlAtom, "");
      }
      return result;
    },
    [connectionPairingUrl, controller],
  );

  const onReconnectMachine = useCallback(
    (machineId: MachineId) => controller.retryMachine(machineId),
    [controller],
  );
  const onSetMachineEnabled = useCallback(
    (machineId: MachineId, enabled: boolean) =>
      controller.setMachineEnabled(machineId, enabled),
    [controller],
  );
  const onUpdateMachine = useCallback(
    (
      machineId: MachineId,
      updates: { readonly label: string; readonly displayUrl: string },
    ) => controller.updateMachine(machineId, updates),
    [controller],
  );

  const onRemoveMachinePress = useCallback(
    (machineId: MachineId) => {
      const machine = connectedMachines.find(
        (candidate) => candidate.machineId === machineId,
      );
      if (!machine) {
        return;
      }
      const remove = {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void controller.removeMachine(machineId);
        },
      } as const;
      if (machine.isRelayManaged) {
        Dialog.alert(
          "Remove from this device?",
          `Forget ${machine.machineLabel} and its cached threads on this device.\n\nIt stays on your Vekrel Connect account and keeps its host space. Deregister it under Vekrel Account → Vekrel Connect to free it.`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open Vekrel Account",
              onPress: () => navigation.navigate("SettingsSheet", { screen: "SettingsAuth" }),
            },
            remove,
          ],
        );
        return;
      }
      Dialog.alert(
        "Remove from this device?",
        `Forget ${machine.machineLabel} and its cached threads on this device. Switch it off instead to keep it saved.`,
        [{ text: "Cancel", style: "cancel" }, remove],
      );
    },
    [connectedMachines, controller, navigation],
  );

  return {
    connectionPairingUrl,
    connectionState,
    connectionError,
    pairingConnectionError: pendingConnectionError,
    connectedMachines,
    connectedMachineCount: connectedMachines.length,
    onChangeConnectionPairingUrl,
    onConnectPress,
    onReconnectMachine,
    onSetMachineEnabled,
    onUpdateMachine,
    onRemoveMachinePress,
  };
}
