import type { MachineId } from "@vekrel/contracts";
import type { RelayClientMachineRecord } from "@vekrel/contracts/relay";
import type { ConnectedMachineSummary } from "../../state/remote-runtime-types";

export interface MachineSectionsInput {
  readonly connectedMachines: ReadonlyArray<ConnectedMachineSummary>;
  readonly cloudMachines: ReadonlyArray<RelayClientMachineRecord> | null;
}

export interface MachineSections {
  readonly localMachines: ReadonlyArray<ConnectedMachineSummary>;
  readonly connectedCloudMachines: ReadonlyArray<ConnectedMachineSummary>;
  readonly availableCloudMachines: ReadonlyArray<RelayClientMachineRecord>;
}

export function relayManagedMachineIds(
  machines: ReadonlyArray<{
    readonly machineId: MachineId;
    readonly isRelayManaged: boolean;
  }>,
): ReadonlySet<MachineId> {
  return new Set(
    machines
      .filter((machine) => machine.isRelayManaged)
      .map((machine) => machine.machineId),
  );
}

export function splitMachineSections(input: MachineSectionsInput): MachineSections {
  const savedMachineIds = relayManagedMachineIds(input.connectedMachines);

  return {
    localMachines: input.connectedMachines.filter(
      (machine) => !machine.isRelayManaged,
    ),
    connectedCloudMachines: input.connectedMachines.filter(
      (machine) => machine.isRelayManaged,
    ),
    availableCloudMachines: (input.cloudMachines ?? []).filter(
      (machine) => !savedMachineIds.has(machine.machineId),
    ),
  };
}
