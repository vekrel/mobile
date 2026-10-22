import type {
  MachinePresentation,
  PreparedConnection,
} from "@vekrel/client-runtime/connection";
import { PrimaryConnectionTarget } from "@vekrel/client-runtime/connection";
import type { ServerConfig } from "@vekrel/contracts";
import { MachineId } from "@vekrel/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import { Atom, AtomRegistry } from "effect/reactivity";

import { createRemoteMachineProjectionAtoms } from "./remote-machine-projections";

const MACHINE_ID = MachineId.make("machine-1");
const OTHER_MACHINE_ID = MachineId.make("machine-2");

function target(machineId: MachineId, endpoint: string = machineId) {
  return new PrimaryConnectionTarget({
    machineId,
    label: `Machine ${machineId}`,
    httpBaseUrl: `https://${endpoint}.example.test`,
    wsBaseUrl: `wss://${endpoint}.example.test`,
  });
}

function presentation(
  machineId: MachineId,
  endpoint: string = machineId,
  serverConfig: ServerConfig | null = null,
): MachinePresentation {
  return {
    entry: { target: target(machineId, endpoint), profile: Option.none(), enabled: true },
    connection: { phase: "connected", error: null, traceId: null },
    serverConfig,
  };
}

function prepared(
  machineId: MachineId,
  endpoint: string,
  token: string,
): PreparedConnection {
  return {
    machineId,
    label: `Machine ${machineId}`,
    httpBaseUrl: `https://${endpoint}.example.test`,
    socketUrl: `wss://${endpoint}.example.test/ws?token=redacted`,
    httpAuthorization: { _tag: "Bearer", token },
    target: target(machineId, endpoint),
  };
}

function makeHarness() {
  const presentationAtoms = Atom.family((machineId: MachineId) =>
    Atom.make<MachinePresentation | null>(presentation(machineId)),
  );
  const preparedConnectionAtoms = Atom.family((_machineId: MachineId) =>
    Atom.make<Option.Option<PreparedConnection>>(Option.none()),
  );
  const serverConfigAtoms = Atom.family((_machineId: MachineId) =>
    Atom.make<ServerConfig | null>(null),
  );
  const projections = createRemoteMachineProjectionAtoms({
    presentationAtom: presentationAtoms,
    preparedConnectionAtom: preparedConnectionAtoms,
    serverConfigAtom: serverConfigAtoms,
  });

  return {
    registry: AtomRegistry.make(),
    presentationAtom: presentationAtoms,
    preparedConnectionAtom: preparedConnectionAtoms,
    serverConfigAtom: serverConfigAtoms,
    projections,
  };
}

describe("remote machine projections", () => {
  it("shares each machine projection and invalidates only changed inputs", () => {
    const harness = makeHarness();
    const firstConsumer = Atom.make((get) =>
      get(harness.projections.savedConnectionAtom(MACHINE_ID)),
    );
    const secondConsumer = Atom.make((get) =>
      get(harness.projections.savedConnectionAtom(MACHINE_ID)),
    );
    const otherConsumer = Atom.make((get) =>
      get(harness.projections.savedConnectionAtom(OTHER_MACHINE_ID)),
    );
    const initial = harness.registry.get(firstConsumer);
    const otherInitial = harness.registry.get(otherConsumer);

    expect(harness.registry.get(secondConsumer)).toBe(initial);
    expect(initial).toMatchObject({
      machineLabel: "Machine machine-1",
      pairingUrl: "https://machine-1.example.test",
      displayUrl: "https://machine-1.example.test",
      httpBaseUrl: "https://machine-1.example.test",
      wsBaseUrl: "wss://machine-1.example.test",
      bearerToken: null,
    });

    harness.registry.set(
      harness.preparedConnectionAtom(MACHINE_ID),
      Option.some(prepared(MACHINE_ID, "rotated", "rotated-token")),
    );
    const rotated = harness.registry.get(firstConsumer);

    expect(rotated).not.toBe(initial);
    expect(rotated).toMatchObject({
      httpBaseUrl: "https://rotated.example.test",
      wsBaseUrl: "wss://rotated.example.test",
      bearerToken: "rotated-token",
    });
    expect(harness.registry.get(secondConsumer)).toBe(rotated);
    expect(harness.registry.get(otherConsumer)).toBe(otherInitial);

    harness.registry.set(harness.preparedConnectionAtom(MACHINE_ID), Option.none());
    harness.registry.set(
      harness.presentationAtom(MACHINE_ID),
      presentation(MACHINE_ID, "catalog-updated"),
    );

    expect(harness.registry.get(firstConsumer)).toMatchObject({
      displayUrl: "https://catalog-updated.example.test",
      httpBaseUrl: "https://catalog-updated.example.test",
      wsBaseUrl: "wss://catalog-updated.example.test",
      bearerToken: null,
    });
  });
});
