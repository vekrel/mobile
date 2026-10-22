import type { MachineConnectionPhase } from "@vekrel/client-runtime/connection";
import { MachineId } from "@vekrel/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveAddProjectMachine } from "./AddProjectScreen.logic";

const MACHINE_A = MachineId.make("machine-a");
const MACHINE_B = MachineId.make("machine-b");

function machine(machineId: MachineId, connectionState: MachineConnectionPhase) {
  return { machineId, connectionState };
}

describe("resolveAddProjectMachine", () => {
  it("does not redirect an explicit unavailable machine to another machine", () => {
    expect(
      resolveAddProjectMachine(
        [machine(MACHINE_A, "offline"), machine(MACHINE_B, "connected")],
        MACHINE_A,
      ),
    ).toBeNull();
  });
});
