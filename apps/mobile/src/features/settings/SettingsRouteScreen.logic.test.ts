import { MachineId } from "@vekrel/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveAutoSettleReferenceMachineId } from "./SettingsRouteScreen.logic";

describe("resolveAutoSettleReferenceMachineId", () => {
  const firstId = MachineId.make("first");
  const secondId = MachineId.make("second");

  it("waits for an earlier grant before exposing a later writable reference", () => {
    const second = { machineId: secondId, canWriteSettings: true };
    expect(
      resolveAutoSettleReferenceMachineId([
        { machineId: firstId, canWriteSettings: null },
        second,
      ]),
    ).toBeNull();
    expect(
      resolveAutoSettleReferenceMachineId([
        { machineId: firstId, canWriteSettings: false },
        second,
      ]),
    ).toBe(secondId);
    expect(
      resolveAutoSettleReferenceMachineId([
        { machineId: firstId, canWriteSettings: true },
        second,
      ]),
    ).toBe(firstId);
  });

  it("waits before showing a read-only fallback until all grants are resolved", () => {
    expect(
      resolveAutoSettleReferenceMachineId([
        { machineId: firstId, canWriteSettings: false },
        { machineId: secondId, canWriteSettings: null },
      ]),
    ).toBeNull();
    expect(
      resolveAutoSettleReferenceMachineId([
        { machineId: firstId, canWriteSettings: false },
        { machineId: secondId, canWriteSettings: false },
      ]),
    ).toBe(firstId);
  });
});
