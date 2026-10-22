import type { MachinePresentation, NetworkStatus } from "@vekrel/client-runtime/connection";
import type { MachineCatalogState } from "@vekrel/client-runtime/state/connections";
import type { MachineId } from "@vekrel/contracts";
import { createMachineSummaryAtoms } from "@vekrel/client-runtime/state/presentation";
import { Atom } from "effect/reactivity";

import { projectWorkspaceConnectionState } from "./workspaceModel";

export function createWorkspaceConnectionAtoms(input: {
  readonly catalogValueAtom: Atom.Atom<MachineCatalogState>;
  readonly networkStatusValueAtom: Atom.Atom<NetworkStatus>;
  readonly presentationAtom: (
    machineId: MachineId,
  ) => Atom.Atom<MachinePresentation | null>;
}) {
  const { machinesAtom } = createMachineSummaryAtoms(input);
  const isReadyAtom = input.catalogValueAtom.pipe(Atom.map((catalog) => catalog.isReady));
  const stateAtom = Atom.make((get) =>
    projectWorkspaceConnectionState({
      isReady: get(isReadyAtom),
      networkStatus: get(input.networkStatusValueAtom),
      machines: get(machinesAtom),
    }),
  ).pipe(Atom.withLabel("mobile:workspace-connection-state"));
  return { machinesAtom, stateAtom, isReadyAtom };
}
