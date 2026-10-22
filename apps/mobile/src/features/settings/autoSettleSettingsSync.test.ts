import { DEFAULT_SERVER_SETTINGS, MachineId, ProjectId } from "@vekrel/contracts";
import { describe, expect, it } from "vite-plus/test";

import { planAutoSettleSettingsSync } from "./autoSettleSettingsSync";

const reference = {
  machineId: MachineId.make("reference"),
  settings: {
    ...DEFAULT_SERVER_SETTINGS,
    sidebarAutoSettleAfterDays: 7,
    sidebarAutoSettleOnMerge: true,
    newWorktreesStartFromOrigin: false,
    continueThreadsAfterServerUpdate: false,
  },
};

describe("auto-settle settings sync", () => {
  it("ignores differences in independently configured machine settings", () => {
    const target = {
      machineId: MachineId.make("remote"),
      label: "Remote",
      settings: {
        ...reference.settings,
        newWorktreesStartFromOrigin: true,
        continueThreadsAfterServerUpdate: true,
        sourceControlWritingStyle: {
          ...reference.settings.sourceControlWritingStyle,
          customInstructions: "Keep this machine's writing instructions.",
        },
      },
    };

    const plan = planAutoSettleSettingsSync(reference, [target]);

    expect(plan.mismatches).toEqual([]);
    expect(plan.patch).toEqual({
      sidebarAutoSettleAfterDays: 7,
      sidebarAutoSettleOnMerge: true,
    });
  });

  it("applies only auto-settle defaults when another machine differs", () => {
    const target = {
      machineId: MachineId.make("remote"),
      label: "Remote",
      settings: {
        ...reference.settings,
        sidebarAutoSettleAfterDays: null,
        sidebarAutoSettleOnMerge: false,
        newWorktreesStartFromOrigin: true,
        continueThreadsAfterServerUpdate: true,
        sourceControlWritingStyle: {
          ...reference.settings.sourceControlWritingStyle,
          customInstructions: "Preserve these instructions.",
        },
      },
    };

    const plan = planAutoSettleSettingsSync(reference, [target]);
    const updated = { ...target.settings, ...plan.patch };

    expect(plan.mismatches).toEqual([target]);
    expect(updated.sidebarAutoSettleAfterDays).toBe(7);
    expect(updated.sidebarAutoSettleOnMerge).toBe(true);
    expect(updated.newWorktreesStartFromOrigin).toBe(true);
    expect(updated.continueThreadsAfterServerUpdate).toBe(true);
    expect(updated.sourceControlWritingStyle).toEqual(target.settings.sourceControlWritingStyle);
  });

  it("notices different project checkouts on the same machine", () => {
    const projectReference = { ...reference, projectId: ProjectId.make("one") };
    const otherCheckout = {
      machineId: reference.machineId,
      projectId: ProjectId.make("two"),
      label: "Other checkout",
      settings: { ...reference.settings, sidebarAutoSettleAfterDays: null },
    };

    expect(planAutoSettleSettingsSync(projectReference, [otherCheckout]).mismatches).toEqual([
      otherCheckout,
    ]);
  });
});
