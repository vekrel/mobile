import { createServerMachineAtoms } from "@vekrel/client-runtime/state/server";
import {
  createOutdatedServerDescriptionCommand,
  createOutdatedServerUpdateCommand,
} from "@vekrel/client-runtime/state/outdatedServerUpdate";
import { createMachineServerConfigsAtom } from "@vekrel/client-runtime/state/shell";

import { machineCatalog } from "../connection/catalog";
import { connectionAtomRuntime } from "../connection/runtime";
import { machineSession } from "./session";
import { createThreadListMachinesAtom } from "./thread-list-machines";

export const serverMachine = createServerMachineAtoms(connectionAtomRuntime, {
  initialConfigValueAtom: machineSession.initialConfigValueAtom,
  usageLimitSources: true,
  usageLimitsCommand: true,
});
export const describeOutdatedServer = createOutdatedServerDescriptionCommand(connectionAtomRuntime);
export const updateOutdatedServer = createOutdatedServerUpdateCommand(connectionAtomRuntime);
export const machineServerConfigsAtom = createMachineServerConfigsAtom({
  catalogValueAtom: machineCatalog.catalogValueAtom,
  serverConfigValueAtom: serverMachine.configValueAtom,
});

export const threadListMachinesAtom = createThreadListMachinesAtom(
  machineServerConfigsAtom,
);
