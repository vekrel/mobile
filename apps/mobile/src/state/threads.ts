import { useAtomValue } from "@effect/atom-react";
import {
  createMachineThreadDetailAtoms,
  createMachineThreadShellAtoms,
  createMachineThreadStateAtoms,
  EMPTY_MACHINE_THREAD_STATE,
  type MachineThreadState,
  createThreadMachineAtoms,
} from "@vekrel/client-runtime/state/threads";
import type { MachineId, ThreadId } from "@vekrel/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";

import { machineCatalog } from "../connection/catalog";
import { connectionAtomRuntime } from "../connection/runtime";
import { machineSnapshotAtom } from "./shell";

export const threadMachine = createThreadMachineAtoms(
  connectionAtomRuntime,
  machineSnapshotAtom,
);
export const machineThreads = createMachineThreadStateAtoms(connectionAtomRuntime);
export const machineThreadDetails = createMachineThreadDetailAtoms(
  machineThreads.stateAtom,
);
export const machineThreadShells = createMachineThreadShellAtoms({
  catalogValueAtom: machineCatalog.catalogValueAtom,
  snapshotAtom: threadMachine.snapshotAtom,
});

const EMPTY_THREAD_STATE_ATOM = Atom.make(AsyncResult.success(EMPTY_MACHINE_THREAD_STATE)).pipe(
  Atom.withLabel("mobile-machine-thread:empty"),
);

export function useMachineThread(
  machineId: MachineId | null,
  threadId: ThreadId | null,
): MachineThreadState {
  const result = useAtomValue(
    machineId !== null && threadId !== null
      ? machineThreads.stateAtom(machineId, threadId)
      : EMPTY_THREAD_STATE_ATOM,
  );
  const state = Option.getOrElse(
    AsyncResult.value(result),
    () => EMPTY_MACHINE_THREAD_STATE,
  ) as MachineThreadState;
  return state;
}
