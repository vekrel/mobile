import type { MachineId } from "@vekrel/contracts";

/** Null follows all machines, including ones connected after the menu opened. */
export function toggleUsageMachine(
  selected: ReadonlySet<MachineId> | null,
  machines: readonly { readonly machineId: MachineId }[],
  toggledId: MachineId,
): ReadonlySet<MachineId> | null {
  const ids = machines.map(({ machineId }) => machineId);
  const next = new Set(ids.filter((id) => selected === null || selected.has(id)));
  if (ids.includes(toggledId)) {
    if (next.has(toggledId)) next.delete(toggledId);
    else next.add(toggledId);
  }
  return ids.every((id) => next.has(id)) ? null : next;
}
