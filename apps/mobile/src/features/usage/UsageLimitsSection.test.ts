import { MachineId } from "@vekrel/contracts";
import { beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  presentations: new Map(),
  refreshProviders: vi.fn(),
  autoRefresh: async () => {},
  refreshingRef: { current: false },
}));
vi.mock("../../state/session", () => ({
  useMachineScope: () => true,
  readMachineScope: () => true,
}));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) {
      state.values[index] = typeof initial === "function" ? initial() : initial;
    }
    return [
      state.values[index],
      (next: unknown) => {
        state.values[index] = typeof next === "function" ? next(state.values[index]) : next;
      },
    ];
  },
  useRef: () => state.refreshingRef,
  useEffect: () => {},
  useEffectEvent: (callback: () => Promise<void>) => {
    state.autoRefresh = callback;
    return callback;
  },
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => state.presentations }));
vi.mock("react-native", () => ({ Alert: {}, Pressable: "button", View: "div" }));
vi.mock("../../components/ui/AppText", () => ({ AppText: "span" }));
vi.mock("../../components/ProviderIcon", () => ({ ProviderIcon: () => null }));
vi.mock("./usageProviders", () => ({ useProviderColors: () => ({}) }));
vi.mock("../../state/presentation", () => ({
  machinePresentations: { presentationsAtom: null },
}));
vi.mock("../../state/server", () => ({ serverMachine: { refreshProviders: null } }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.refreshProviders }));

import { useRefreshLimits } from "./UsageLimitsSection";
import { refreshUsageLimits } from "@vekrel/client-runtime/state/usage";

beforeEach(() => {
  state.values = [];
  state.cursor = 0;
  state.refreshingRef.current = false;
  state.refreshProviders.mockReset();
});

it("keeps a newer machine failure when an older refresh finishes", async () => {
  const a = MachineId.make("mobile-limits-a");
  const b = MachineId.make("mobile-limits-b");
  const pending = Promise.withResolvers<{ _tag: string }>();
  const read = () => {
    state.cursor = 0;
    return useRefreshLimits();
  };
  const presentation = (label: string) => ({
    connection: { phase: "connected" },
    entry: { target: { label } },
  });
  state.presentations = new Map([[a, presentation("A")]]);
  state.refreshProviders.mockImplementation(({ machineId }) =>
    machineId === a ? pending.promise : Promise.resolve({ _tag: "Failure" }),
  );
  const first = read().refresh();
  state.presentations = new Map([
    [a, presentation("A")],
    [b, presentation("B")],
  ]);
  read();
  await state.autoRefresh();
  expect(read().failedLabels).toEqual(["B"]);
  pending.resolve({ _tag: "Success" });
  await first;
  expect(read().failedLabels).toEqual(["B"]);
});

it("does not let an older multi-machine batch clear a newer failure for the same machine", async () => {
  const a = MachineId.make("mobile-limits-race-a");
  const b = MachineId.make("mobile-limits-race-b");
  const aFirst = Promise.withResolvers<{ _tag: string }>();
  const bFirst = Promise.withResolvers<{ _tag: string }>();
  const read = (selected: ReadonlySet<MachineId> | null = null) => {
    state.cursor = 0;
    return useRefreshLimits(selected);
  };
  const presentation = (label: string) => ({
    connection: { phase: "connected" },
    entry: { target: { label } },
  });
  state.presentations = new Map([
    [a, presentation("A")],
    [b, presentation("B")],
  ]);
  let aCalls = 0;
  state.refreshProviders.mockImplementation(({ machineId }) =>
    machineId === b
      ? bFirst.promise
      : ++aCalls === 1
        ? aFirst.promise
        : Promise.resolve({ _tag: "Failure" }),
  );
  read();
  const older = state.autoRefresh();
  aFirst.resolve({ _tag: "Success" });
  await refreshUsageLimits(a, () => aFirst.promise);
  const selected = new Set([a]);
  await read(selected).refresh();
  expect(read(selected).failedLabels).toEqual(["A"]);
  bFirst.resolve({ _tag: "Success" });
  await older;
  expect(read(selected).failedLabels).toEqual(["A"]);
});
