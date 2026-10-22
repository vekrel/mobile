import {
  createMachineShellAtoms,
  createMachineShellSummaryAtom,
  createMachineSnapshotAtom,
  createShellMachineAtoms,
  type MachineShellState,
} from "@vekrel/client-runtime/state/shell";
import { useAtomValue } from "@effect/atom-react";
import type { MachineId } from "@vekrel/contracts";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";

import { machineCatalog } from "../connection/catalog";
import { connectionAtomRuntime } from "../connection/runtime";

export const shellMachine = createShellMachineAtoms(connectionAtomRuntime);
export const machineShell = createMachineShellAtoms(connectionAtomRuntime);
export const machineSnapshotAtom = createMachineSnapshotAtom(machineShell.stateAtom);
export const machineShellSummaryAtom = createMachineShellSummaryAtom({
  catalogValueAtom: machineCatalog.catalogValueAtom,
  shellStateValueAtom: machineShell.stateValueAtom,
});

const EMPTY_MACHINE_SHELL_STATE_ATOM = Atom.make<MachineShellState>({
  snapshot: Option.none(),
  status: "empty",
  error: Option.none(),
});

const shellStatus = (state: MachineShellState) => state.status;
const shellHasError = (state: MachineShellState) => Option.isSome(state.error);

export function useMachineShellReadiness(machineId: MachineId | null) {
  const atom =
    machineId === null
      ? EMPTY_MACHINE_SHELL_STATE_ATOM
      : machineShell.stateValueAtom(machineId);
  return {
    status: useAtomValue(atom, shellStatus),
    hasError: useAtomValue(atom, shellHasError),
  };
}
