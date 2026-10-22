import type { MachineThreadShell } from "@vekrel/client-runtime/state/shell";
import {
  MachineId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type ServerConfig,
} from "@vekrel/contracts";
import { describe, expect, it } from "vite-plus/test";
import { Atom, AtomRegistry } from "effect/reactivity";

import { createThreadListMachinesAtom } from "../../state/thread-list-machines";

import {
  createThreadRowProviderInstanceResolver,
  resolveThreadProviderInstance,
} from "./thread-provider-instance";

function makeConfig(
  providers: ReadonlyArray<{
    readonly instanceId: string;
    readonly driver: string;
    readonly displayName?: string;
    readonly accentColor?: string;
  }>,
): ServerConfig {
  return {
    providers: providers.map((provider) => ({ enabled: true, ...provider })),
    machine: { capabilities: {}, platform: { machine: "laptop" } },
    settings: {},
  } as unknown as ServerConfig;
}

function makeThread(machineId: MachineId, instanceId: string): MachineThreadShell {
  return {
    machineId,
    id: ThreadId.make("thread-1"),
    projectId: ProjectId.make("project-1"),
    title: "Thread",
    modelSelection: { instanceId: ProviderInstanceId.make(instanceId), model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestRun: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    runtime: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  } as unknown as MachineThreadShell;
}

describe("resolveThreadProviderInstance", () => {
  it("resolves two machines with the same default instance id independently", () => {
    const machineA = MachineId.make("machine-a");
    const machineB = MachineId.make("machine-b");
    const serverConfigs = new Map<MachineId, ServerConfig>([
      [
        machineA,
        makeConfig([{ instanceId: "codex", driver: "codex", accentColor: "#ff8800" }]),
      ],
      [machineB, makeConfig([{ instanceId: "codex", driver: "codex" }])],
    ]);

    const threadA = makeThread(machineA, "codex");
    const threadB = makeThread(machineB, "codex");

    expect(
      resolveThreadProviderInstance(serverConfigs.get(machineA)?.providers, threadA)
        ?.accentColor,
    ).toBe("#ff8800");
    expect(
      resolveThreadProviderInstance(serverConfigs.get(machineB)?.providers, threadB)
        ?.accentColor,
    ).toBeUndefined();
  });

  it("uses the current runtime owner after a provider handoff", () => {
    const machineId = MachineId.make("machine-a");
    const serverConfigs = new Map<MachineId, ServerConfig>([
      [
        machineId,
        makeConfig([
          { instanceId: "claudeAgent", driver: "claudeAgent" },
          { instanceId: "codex", driver: "codex", displayName: "Codex" },
          { instanceId: "codex_work", driver: "codex", displayName: "Codex" },
        ]),
      ],
    ]);
    const thread = {
      ...makeThread(machineId, "claudeAgent"),
      runtime: {
        status: "running" as const,
        activeRunId: null,
        providerInstanceId: ProviderInstanceId.make("codex_work"),
        providerName: "Codex",
        lastError: null,
        updatedAt: "2026-06-01T00:01:00.000Z",
      },
    };

    expect(
      resolveThreadProviderInstance(serverConfigs.get(machineId)?.providers, thread),
    ).toMatchObject({
      driverKind: "codex",
      displayName: "Codex Work",
      showBadge: true,
    });
  });
});

describe("createThreadRowProviderInstanceResolver", () => {
  it("updates thread badges through the machine projection when a sibling is disabled and re-enabled", () => {
    const machineId = MachineId.make("machine-a");
    const personal = makeThread(machineId, "codex");
    const work = makeThread(machineId, "codex_work");
    const config = makeConfig([
      { instanceId: "codex", driver: "codex" },
      { instanceId: "codex_work", driver: "codex" },
    ]);
    const configs = Atom.make<ReadonlyMap<MachineId, ServerConfig>>(
      new Map([[machineId, config]]),
    );
    const machines = createThreadListMachinesAtom(configs);
    const registry = AtomRegistry.make();
    registry.mount(machines);
    try {
      const before = createThreadRowProviderInstanceResolver(
        registry.get(machines).providersByMachineId,
      );
      expect(before(personal)?.showBadge).toBe(true);
      expect(before(work)?.showBadge).toBe(true);

      registry.set(
        configs,
        new Map([
          [
            machineId,
            {
              ...config,
              providers: config.providers.map((provider) =>
                provider.instanceId === "codex_work" ? { ...provider, enabled: false } : provider,
              ),
            },
          ],
        ]),
      );
      const disabled = createThreadRowProviderInstanceResolver(
        registry.get(machines).providersByMachineId,
      );
      expect(disabled(personal)?.showBadge).toBe(false);
      expect(disabled(work)?.showBadge).toBe(true);

      registry.set(configs, new Map([[machineId, config]]));
      const restored = createThreadRowProviderInstanceResolver(
        registry.get(machines).providersByMachineId,
      );
      expect(restored(personal)?.showBadge).toBe(true);
      expect(restored(work)?.showBadge).toBe(true);
    } finally {
      registry.dispose();
    }
  });
});
