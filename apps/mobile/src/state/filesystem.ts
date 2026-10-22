import { createFilesystemMachineAtoms } from "@vekrel/client-runtime/state/filesystem";

import { connectionAtomRuntime } from "../connection/runtime";

export const filesystemMachine = createFilesystemMachineAtoms(connectionAtomRuntime);
