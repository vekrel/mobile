import { MachineId } from "@vekrel/contracts";
import type { RelayClientMachineRecord } from "@vekrel/contracts/relay";
import { describe, expect, it } from "vite-plus/test";
import type { ConnectedMachineSummary } from "../../state/remote-runtime-types";
import { splitMachineSections } from "./machineSections";

function connectedMachine(
  input: Omit<Partial<ConnectedMachineSummary>, "machineId"> & {
    readonly machineId: string;
    readonly isRelayManaged: boolean;
  },
): ConnectedMachineSummary {
  return {
    machineId: MachineId.make(input.machineId),
    machineLabel: input.machineLabel ?? input.machineId,
    displayUrl: input.displayUrl ?? `https://${input.machineId}.example.test/`,
    isRelayManaged: input.isRelayManaged,
    isEnabled: input.isEnabled ?? true,
    connectionState: input.connectionState ?? "connected",
    connectionError: input.connectionError ?? null,
    connectionErrorTraceId: input.connectionErrorTraceId ?? null,
  };
}

function cloudMachine(machineId: string): RelayClientMachineRecord {
  return {
    machineId: MachineId.make(machineId),
    label: machineId,
    endpoint: {
      httpBaseUrl: `https://${machineId}.cloud.example.test/`,
      wsBaseUrl: `wss://${machineId}.cloud.example.test/ws`,
      providerKind: "cloudflare_tunnel",
    },
    linkedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("mobile machine settings sections", () => {
  it("keeps saved relay-managed connections under Vekrel Connect", () => {
    const local = connectedMachine({
      machineId: "machine-local",
      isRelayManaged: false,
    });
    const cloud = connectedMachine({
      machineId: "machine-cloud",
      isRelayManaged: true,
    });

    const sections = splitMachineSections({
      connectedMachines: [cloud, local],
      cloudMachines: [
        cloudMachine("machine-cloud"),
        cloudMachine("machine-new"),
      ],
    });

    expect(sections.localMachines).toEqual([local]);
    expect(sections.connectedCloudMachines).toEqual([cloud]);
    expect(
      sections.availableCloudMachines.map((machine) => machine.machineId),
    ).toEqual([MachineId.make("machine-new")]);
  });

  it("keeps saved relay-managed connections visible when cloud listing is unavailable", () => {
    const cloud = connectedMachine({
      machineId: "machine-cloud",
      isRelayManaged: true,
      connectionState: "reconnecting",
      connectionError: "Machine did not respond before the connection timeout.",
    });

    const sections = splitMachineSections({
      connectedMachines: [cloud],
      cloudMachines: null,
    });

    expect(sections.localMachines).toEqual([]);
    expect(sections.connectedCloudMachines).toEqual([cloud]);
    expect(sections.availableCloudMachines).toEqual([]);
  });

  it("still offers a cloud machine saved directly as a local backend", () => {
    const local = connectedMachine({
      machineId: "machine-cloud",
      isRelayManaged: false,
    });

    const sections = splitMachineSections({
      connectedMachines: [local],
      cloudMachines: [cloudMachine("machine-cloud")],
    });

    expect(sections.localMachines).toEqual([local]);
    expect(sections.connectedCloudMachines).toEqual([]);
    expect(
      sections.availableCloudMachines.map((machine) => machine.machineId),
    ).toEqual([MachineId.make("machine-cloud")]);
  });
});
