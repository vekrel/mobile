import { describe, expect, it } from "@effect/vitest";
import {
  PrimaryConnectionTarget,
  type MachinePresentation,
  type NetworkStatus,
} from "@vekrel/client-runtime/connection";
import type { MachineCatalogState } from "@vekrel/client-runtime/state/connections";
import type { MachineShellSummary } from "@vekrel/client-runtime/state/shell";
import { MachineId, type ServerConfig } from "@vekrel/contracts";
import * as Option from "effect/Option";
import { Atom, AtomRegistry } from "effect/reactivity";

import { createWorkspaceConnectionAtoms } from "./workspace-connection-atoms";
import { projectWorkspaceMachine, projectWorkspaceState } from "./workspaceModel";

const ID = MachineId.make("machine-1");
function presentation(): MachinePresentation {
  return {
    entry: {
      target: new PrimaryConnectionTarget({
        machineId: ID,
        label: "Mac",
        httpBaseUrl: "https://example.test",
        wsBaseUrl: "wss://example.test",
      }),
      enabled: true,
      profile: Option.none(),
    },
    connection: { phase: "connected", error: null, traceId: null },
    serverConfig: null,
  };
}
function harness() {
  const source = Atom.make<MachinePresentation | null>(presentation());
  const catalog = Atom.make<MachineCatalogState>({
    isReady: true,
    entries: new Map([[ID, presentation().entry]]),
  });
  const network = Atom.make<NetworkStatus>("online");
  const atoms = createWorkspaceConnectionAtoms({
    catalogValueAtom: catalog,
    networkStatusValueAtom: network,
    presentationAtom: () => source,
  });
  const registry = AtomRegistry.make();
  return { source, catalog, network, registry, ...atoms };
}

describe("workspace connection subscriptions", () => {
  it("keeps connection consumers stable across shell and provider updates", () => {
    const h = harness();
    const shell = Atom.make<MachineShellSummary>({
      hasSnapshot: true,
      hasSynchronizingShell: false,
      hasCachedShell: false,
      hasLiveShell: true,
      firstError: null,
    });
    const broadState = Atom.make((get) =>
      projectWorkspaceState({
        isReady: get(h.catalog).isReady,
        networkStatus: get(h.network),
        machines: [projectWorkspaceMachine(ID, get(h.source)!)],
        shellSummary: get(shell),
        hasSyncingConnectedMachine: false,
      }),
    );
    const initial = h.registry.get(h.stateAtom);
    const initialMachines = h.registry.get(h.machinesAtom);
    let broadChanges = 0;
    let connectionChanges = 0;
    const stopBroad = h.registry.subscribe(broadState, () => broadChanges++);
    const stopNarrow = h.registry.subscribe(h.stateAtom, () => connectionChanges++);
    try {
      for (let index = 0; index < 20; index++) {
        h.registry.set(shell, {
          ...h.registry.get(shell),
          hasSynchronizingShell: index % 2 === 0,
        });
        h.registry.get(broadState);
        h.registry.get(h.stateAtom);
      }
      expect(broadChanges).toBe(20);
      expect(connectionChanges).toBe(0);
      for (let index = 0; index < 4; index++) {
        const config = { cwd: `/workspace-${index}` } as ServerConfig;
        h.registry.set(h.source, { ...presentation(), serverConfig: config });
        expect(h.registry.get(h.source)?.serverConfig).toBe(config);
        expect(h.registry.get(h.stateAtom)).toBe(initial);
        expect(h.registry.get(h.machinesAtom)).toBe(initialMachines);
      }
      expect(connectionChanges).toBe(0);
    } finally {
      stopBroad();
      stopNarrow();
      h.registry.dispose();
    }
  });
});
