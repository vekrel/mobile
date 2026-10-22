import type {
  MachinePresentation,
  PreparedConnection,
} from "@vekrel/client-runtime/connection";
import { connectionCatalogDisplayUrl } from "@vekrel/client-runtime/connection";
import type { MachineId, ServerConfig } from "@vekrel/contracts";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";

import type { SavedRemoteConnection } from "../lib/connection";
import type { MachineRuntimeState } from "./remote-runtime-types";

export function createRemoteMachineProjectionAtoms(input: {
  readonly presentationAtom: (
    machineId: MachineId,
  ) => Atom.Atom<MachinePresentation | null>;
  readonly preparedConnectionAtom: (
    machineId: MachineId,
  ) => Atom.Atom<Option.Option<PreparedConnection>>;
  readonly serverConfigAtom: (machineId: MachineId) => Atom.Atom<ServerConfig | null>;
}) {
  const savedConnectionAtom = Atom.family((machineId: MachineId) => {
    let previousEntry: MachinePresentation["entry"] | null = null;
    let previousPrepared: PreparedConnection | null = null;
    let previous: SavedRemoteConnection | null = null;

    return Atom.make((get) => {
      const presentation = get(input.presentationAtom(machineId));
      if (presentation === null) {
        previousEntry = null;
        previousPrepared = null;
        previous = null;
        return null;
      }

      const prepared = Option.getOrNull(get(input.preparedConnectionAtom(machineId)));
      if (
        previous !== null &&
        presentation.entry === previousEntry &&
        prepared === previousPrepared
      ) {
        return previous;
      }

      const displayUrl = connectionCatalogDisplayUrl(presentation.entry) ?? "";
      const httpBaseUrl = prepared?.httpBaseUrl ?? displayUrl;
      const socketUrl = prepared?.socketUrl ?? "";
      const wsBaseUrl =
        socketUrl === ""
          ? displayUrl.startsWith("https://")
            ? displayUrl.replace(/^https:/, "wss:")
            : displayUrl.replace(/^http:/, "ws:")
          : new URL(socketUrl).origin;
      const authorization = prepared?.httpAuthorization ?? null;
      // Credentials follow the route in use, which may not be the preferred one.
      const relayManaged = prepared
        ? prepared.target._tag === "RelayConnectionTarget"
        : presentation.entry.target._tag === "RelayConnectionTarget";

      previousEntry = presentation.entry;
      previousPrepared = prepared;
      previous = {
        machineId,
        machineLabel: presentation.entry.target.label,
        pairingUrl: displayUrl,
        displayUrl,
        httpBaseUrl,
        wsBaseUrl,
        bearerToken: authorization?._tag === "Bearer" ? authorization.token : null,
        ...(relayManaged
          ? {
              authenticationMethod: "dpop" as const,
              relayManaged: true as const,
              ...(authorization?._tag === "Dpop"
                ? { dpopAccessToken: authorization.accessToken }
                : {}),
            }
          : { authenticationMethod: "bearer" as const }),
      };
      return previous;
    }).pipe(Atom.withLabel(`mobile:saved-connection:${machineId}`));
  });

  const runtimeStateAtom = Atom.family((machineId: MachineId) => {
    let previousConnection: MachinePresentation["connection"] | null = null;
    let previousServerConfig: ServerConfig | null = null;
    let previous: MachineRuntimeState | null = null;

    return Atom.make((get) => {
      const presentation = get(input.presentationAtom(machineId));
      if (presentation === null) {
        previousConnection = null;
        previousServerConfig = null;
        previous = null;
        return null;
      }

      const connection = presentation.connection;
      const serverConfig = get(input.serverConfigAtom(machineId));
      if (
        previous !== null &&
        connection.phase === previousConnection?.phase &&
        connection.error === previousConnection?.error &&
        connection.traceId === previousConnection?.traceId &&
        serverConfig === previousServerConfig
      ) {
        return previous;
      }

      previousConnection = connection;
      previousServerConfig = serverConfig;
      previous = {
        connectionState: connection.phase,
        connectionError: connection.error,
        connectionErrorTraceId: connection.traceId,
        serverConfig,
      };
      return previous;
    }).pipe(Atom.withLabel(`mobile:machine-runtime-state:${machineId}`));
  });

  return { savedConnectionAtom, runtimeStateAtom };
}
