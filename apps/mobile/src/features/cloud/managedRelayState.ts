import { useAtomValue } from "@effect/atom-react";
import {
  createManagedRelayQueryManager,
  deregisterManagedRelayMachine,
  managedRelaySessionAtom,
  readManagedRelaySnapshotState,
} from "@vekrel/client-runtime/relay";
import {
  createAtomCommandScheduler,
  createRuntimeCommand,
} from "@vekrel/client-runtime/state/runtime";
import type { MachineId } from "@vekrel/contracts";
import type { RelayClientMachineRecord } from "@vekrel/contracts/relay";
import { AsyncResult, Atom } from "effect/reactivity";
import { useCallback, useEffect } from "react";

import * as Runtime from "../../lib/runtime";
import { appAtomRegistry } from "../../state/atom-registry";
import { cloudDebugLog } from "./cloudDebugLog";

const managedRelayAtomRuntime = Atom.runtime(Runtime.layer);

export const managedRelayQueryManager = createManagedRelayQueryManager(managedRelayAtomRuntime, {
  onQueryEvent: (event) =>
    cloudDebugLog(`query:${event.operation}:${event.stage}:${event.phase}`, { ...event }),
});

const managedRelayMutationScheduler = createAtomCommandScheduler();

export const deregisterManagedRelayMachineCommand = createRuntimeCommand(
  managedRelayAtomRuntime,
  {
    label: "mobile:managed-relay:deregister-machine",
    scheduler: managedRelayMutationScheduler,
    concurrency: {
      mode: "serial",
      key: (input: { readonly accountId: string; readonly machineId: MachineId }) =>
        input.accountId,
    },
    execute: (input, registry) => deregisterManagedRelayMachine(registry, input),
  },
);

const EMPTY_MACHINES_ATOM = Atom.make(
  AsyncResult.success<ReadonlyArray<RelayClientMachineRecord>>([]),
).pipe(Atom.keepAlive, Atom.withLabel("managed-relay:mobile:machines:null"));

export function useManagedRelayMachines() {
  const session = useAtomValue(managedRelaySessionAtom);
  const accountId = session?.accountId ?? null;
  const atom = accountId
    ? managedRelayQueryManager.machinesAtom(accountId)
    : EMPTY_MACHINES_ATOM;
  const result = useAtomValue(atom);
  const snapshot = readManagedRelaySnapshotState(result);
  useEffect(() => {
    if (snapshot.error) {
      console.error("[t3-cloud] Relay machine listing failed", {
        message: snapshot.error,
        traceId: snapshot.errorTraceId,
      });
    }
  }, [snapshot.error, snapshot.errorTraceId]);
  const refresh = useCallback(() => {
    if (accountId) {
      managedRelayQueryManager.refreshMachines(appAtomRegistry, accountId);
    }
  }, [accountId]);

  return {
    ...snapshot,
    accountId,
    refresh,
  };
}

export function refreshManagedRelayMachines(): void {
  const session = appAtomRegistry.get(managedRelaySessionAtom);
  if (session) {
    managedRelayQueryManager.refreshMachines(appAtomRegistry, session.accountId);
  }
}
