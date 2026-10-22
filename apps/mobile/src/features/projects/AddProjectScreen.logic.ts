import { canCreateProjectInMachine } from "@vekrel/client-runtime/operations/projects";
import type { MachineConnectionPhase } from "@vekrel/client-runtime/connection";
import type { MachineId } from "@vekrel/contracts";

export function resolveAddProjectMachine<
  T extends {
    readonly machineId: MachineId;
    readonly connectionState: MachineConnectionPhase;
  },
>(machineOptions: ReadonlyArray<T>, requestedMachineId: MachineId | null): T | null {
  if (requestedMachineId !== null) {
    return (
      machineOptions.find(
        (machine) =>
          machine.machineId === requestedMachineId &&
          canCreateProjectInMachine(machine.connectionState),
      ) ?? null
    );
  }

  return (
    machineOptions.find((machine) =>
      canCreateProjectInMachine(machine.connectionState),
    ) ?? null
  );
}
