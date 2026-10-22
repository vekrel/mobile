import { useAtomValue } from "@effect/atom-react";
import { createMachineSessionAtoms } from "@vekrel/client-runtime/state/session";
import {
  type AuthMachineScope,
  type AuthSessionState,
  type MachineId,
  sessionGrantsScope,
} from "@vekrel/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { useMemo } from "react";

import { connectionAtomRuntime } from "../connection/runtime";
import { appAtomRegistry } from "./atom-registry";

export const machineSession = createMachineSessionAtoms(connectionAtomRuntime);

const EMPTY_SESSION_STATE_ATOM = Atom.make(AsyncResult.initial<AuthSessionState>());

function sessionHasScope(
  result: AsyncResult.AsyncResult<AuthSessionState, unknown>,
  scope: AuthMachineScope,
): boolean {
  const session = Option.getOrNull(AsyncResult.value(result));
  return result._tag !== "Failure" && session !== null && sessionGrantsScope(session, scope);
}

export function useMachineScope(
  machineId: MachineId | null,
  scope: AuthMachineScope,
): boolean {
  const result = useAtomValue(
    machineId === null
      ? EMPTY_SESSION_STATE_ATOM
      : machineSession.sessionStateAtom(machineId),
  );
  return sessionHasScope(result, scope);
}

export function useMachinesWithScope(
  machines: ReadonlyArray<{ readonly machineId: MachineId }>,
  scope: AuthMachineScope,
): ReadonlySet<MachineId> {
  const permittedMachines = useMemo(
    () =>
      Atom.make((get) => {
        const permitted = new Set<MachineId>();
        for (const { machineId } of machines) {
          if (sessionHasScope(get(machineSession.sessionStateAtom(machineId)), scope)) {
            permitted.add(machineId);
          }
        }
        return permitted;
      }),
    [machines, scope],
  );
  return useAtomValue(permittedMachines);
}

export function readMachineScope(
  machineId: MachineId,
  scope: AuthMachineScope,
): boolean {
  const result = appAtomRegistry.get(machineSession.sessionStateAtom(machineId));
  return sessionHasScope(result, scope);
}

const EMPTY_PREPARED_CONNECTION_ATOM = Atom.make(Option.none()).pipe(
  Atom.withLabel("mobile-prepared-connection:empty"),
);

export function usePreparedConnection(machineId: MachineId | null) {
  return useAtomValue(
    machineId === null
      ? EMPTY_PREPARED_CONNECTION_ATOM
      : machineSession.preparedConnectionValueAtom(machineId),
  );
}
