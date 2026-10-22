import { createMachineProjectAtoms } from "@vekrel/client-runtime/state/projects";
import { createProjectMachineAtoms } from "@vekrel/client-runtime/state/projects";

import { machineCatalog } from "../connection/catalog";
import { connectionAtomRuntime } from "../connection/runtime";
import { machineSnapshotAtom } from "./shell";
import { serverMachine } from "./server";

export const machineProjects = createMachineProjectAtoms({
  catalogValueAtom: machineCatalog.catalogValueAtom,
  snapshotAtom: machineSnapshotAtom,
  serverConfigValueAtom: serverMachine.configValueAtom,
});
export const projectMachine = createProjectMachineAtoms(connectionAtomRuntime, {
  projectAtom: machineProjects.projectAtom,
});
