import type { MachineId } from "@vekrel/contracts";

export function toggleSettingsMachine(
  selected: ReadonlySet<MachineId> | null,
  available: readonly { readonly machineId: MachineId }[],
  toggledId: MachineId,
): ReadonlySet<MachineId> | null {
  const ids = available.map((entry) => entry.machineId);
  const next = new Set(ids.filter((id) => selected === null || selected.has(id)));
  if (ids.includes(toggledId)) {
    if (next.has(toggledId)) next.delete(toggledId);
    else next.add(toggledId);
  }
  return ids.every((id) => next.has(id)) ? null : next;
}

export function settingsTargetsForProject<T extends { readonly machineId: MachineId }>(
  targets: readonly T[],
  group:
    | {
        readonly members: readonly {
          readonly project: { readonly machineId: MachineId };
        }[];
      }
    | null
    | undefined,
): readonly T[] {
  if (group === null) return targets;
  return targets.filter((target) =>
    group?.members.some((member) => member.project.machineId === target.machineId),
  );
}
