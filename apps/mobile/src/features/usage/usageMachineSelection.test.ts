import { MachineId } from "@vekrel/contracts";
import { describe, expect, it } from "vite-plus/test";

import { toggleUsageMachine } from "./usageMachineSelection";

const a = MachineId.make("a");
const b = MachineId.make("b");
const c = MachineId.make("c");
const removed = MachineId.make("removed");
const machines = [a, b, c].map((machineId) => ({ machineId }));

describe("usage machine selection", () => {
  it("can exclude a machine from all, then select all again", () => {
    const selected = toggleUsageMachine(null, machines, b);
    expect(selected).toEqual(new Set([a, c]));
    expect(toggleUsageMachine(selected, machines, b)).toBeNull();
  });

  it("does not count removed IDs toward selecting all current machines", () => {
    expect(toggleUsageMachine(new Set([a, removed]), machines, b)).toEqual(new Set([a, b]));
  });

  it("returns to all mode despite stale IDs when every current machine is selected", () => {
    expect(toggleUsageMachine(new Set([a, c, removed]), machines, b)).toBeNull();
  });

  it("includes newly connected machines only in all mode", () => {
    const expanded = [...machines, { machineId: removed }];
    expect(toggleUsageMachine(null, expanded, a)).toEqual(new Set([b, c, removed]));
    expect(toggleUsageMachine(new Set([a, b, c]), expanded, a)).toEqual(new Set([b, c]));
  });
});
