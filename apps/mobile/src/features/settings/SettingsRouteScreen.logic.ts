import type { MachineId } from "@vekrel/contracts";

export function resolveAutoSettleReferenceMachineId(
  machines: ReadonlyArray<{
    readonly machineId: MachineId;
    readonly canWriteSettings: boolean | null;
  }>,
): MachineId | null {
  for (const machine of machines) {
    if (machine.canWriteSettings === null) return null;
    if (machine.canWriteSettings) return machine.machineId;
  }
  return machines[0]?.machineId ?? null;
}

export function resolveAgentAwarenessPlatformPresentation(platform: string): {
  readonly supported: boolean;
  readonly subtitle: string | undefined;
} {
  return platform === "ios" || platform === "android"
    ? { supported: true, subtitle: undefined }
    : { supported: false, subtitle: "Unavailable on this platform" };
}
