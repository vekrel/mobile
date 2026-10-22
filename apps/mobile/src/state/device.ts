import { createDeviceMachineAtoms } from "@vekrel/client-runtime/state/device";
import { resolveDeviceHubAccess } from "@vekrel/client-runtime/state/deviceHubAccess";
import type { MachineId } from "@vekrel/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";
import { useMemo } from "react";

import { connectionAtomRuntime } from "../connection/runtime";
import { appAtomRegistry } from "./atom-registry";
import { useMachineQuery } from "./query";
import { machineSession, usePreparedConnection } from "./session";

export const deviceMachine = createDeviceMachineAtoms(connectionAtomRuntime);

const deviceHubAccessAtom = Atom.family((machineId: MachineId) =>
  connectionAtomRuntime
    .atom((get) => {
      const prepared = Option.getOrNull(
        get(machineSession.preparedConnectionValueAtom(machineId)),
      );
      return prepared === null
        ? Effect.never
        : resolveDeviceHubAccess({ prepared, hubBasePath: "/api/device-hub" });
    })
    .pipe(Atom.setIdleTTL(60_000), Atom.withLabel(`mobile-device-hub-access:${machineId}`)),
);

export function refreshDeviceHubAccess(machineId: MachineId) {
  appAtomRegistry.refresh(deviceHubAccessAtom(machineId));
}

export function useDeviceHubAccess(machineId: MachineId, hostId: string) {
  const prepared = usePreparedConnection(machineId);
  const query = useMachineQuery(deviceHubAccessAtom(machineId));
  const access = useMemo(
    () =>
      query.data && query.error === null && Option.isSome(prepared)
        ? { ...query.data, query: { ...query.data.query, hostId } }
        : null,
    [query.data, query.error, prepared, hostId],
  );
  return { access, error: query.error, refresh: query.refresh };
}
