import {
  resolveMachineKind,
  type MachineId,
  type MachineKind,
  type ServerConfig,
  type ServerProvider,
} from "@vekrel/contracts";
import { Atom } from "effect/reactivity";

export type ThreadListProvider = Pick<
  ServerProvider,
  "instanceId" | "driver" | "enabled" | "displayName" | "accentColor" | "iconUrl"
>;

const capabilityKeys = [
  "threadSettlement",
  "threadSnooze",
  "threadPinning",
  "threadAutoSettleOptOut",
  "threadPinReorder",
  "threadActiveReorder",
  "threadTitleRegeneration",
] as const;

function selectMachine(config: ServerConfig) {
  return {
    providers: config.providers.map(
      ({ instanceId, driver, enabled, displayName, accentColor, iconUrl }) => ({
        instanceId,
        driver,
        enabled,
        displayName,
        accentColor,
        iconUrl,
      }),
    ),
    machineKind: resolveMachineKind(config),
    capabilities: config.machine.capabilities,
  };
}

type ListMachine = ReturnType<typeof selectMachine>;

function sameProviders(
  left: ReadonlyArray<ThreadListProvider>,
  right: ReadonlyArray<ThreadListProvider>,
) {
  return (
    left.length === right.length &&
    left.every((provider, index) => {
      const other = right[index]!;
      return (
        provider.instanceId === other.instanceId &&
        provider.driver === other.driver &&
        provider.enabled === other.enabled &&
        provider.displayName === other.displayName &&
        provider.accentColor === other.accentColor &&
        provider.iconUrl === other.iconUrl
      );
    })
  );
}

function collectMachines(machines: ReadonlyMap<MachineId, ListMachine>) {
  const providersByMachineId = new Map<MachineId, ReadonlyArray<ThreadListProvider>>();
  const machineByMachineId = new Map<MachineId, MachineKind>();
  const settlementMachineIds = new Set<MachineId>();
  const snoozeMachineIds = new Set<MachineId>();
  const pinningMachineIds = new Set<MachineId>();
  const autoSettleOptOutMachineIds = new Set<MachineId>();
  const pinReorderMachineIds = new Set<MachineId>();
  const activeReorderMachineIds = new Set<MachineId>();
  const titleRegenerationMachineIds = new Set<MachineId>();
  for (const [id, { providers, machineKind, capabilities }] of machines) {
    providersByMachineId.set(id, providers);
    machineByMachineId.set(id, machineKind);
    if (capabilities.threadSettlement === true) settlementMachineIds.add(id);
    if (capabilities.threadSnooze === true) snoozeMachineIds.add(id);
    if (capabilities.threadAutoSettleOptOut === true) autoSettleOptOutMachineIds.add(id);
    if (capabilities.threadPinning === true) pinningMachineIds.add(id);
    if (capabilities.threadPinReorder === true) pinReorderMachineIds.add(id);
    if (capabilities.threadActiveReorder === true) activeReorderMachineIds.add(id);
    if (capabilities.threadTitleRegeneration === true) titleRegenerationMachineIds.add(id);
  }
  return {
    providersByMachineId,
    machineByMachineId,
    settlementMachineIds,
    snoozeMachineIds,
    pinningMachineIds,
    autoSettleOptOutMachineIds,
    pinReorderMachineIds,
    activeReorderMachineIds,
    titleRegenerationMachineIds,
  };
}

export function createThreadListMachinesAtom(
  configsAtom: Atom.Atom<ReadonlyMap<MachineId, ServerConfig>>,
) {
  let previous = new Map<MachineId, ListMachine>();
  let result = collectMachines(previous);
  return Atom.make((get) => {
    const configs = get(configsAtom);
    const next = new Map<MachineId, ListMachine>();
    let changed = configs.size !== previous.size;
    for (const [id, config] of configs) {
      const selected = selectMachine(config);
      const prior = previous.get(id);
      if (prior && sameProviders(prior.providers, selected.providers)) {
        selected.providers = prior.providers;
      }
      const unchanged =
        prior &&
        prior.providers === selected.providers &&
        prior.machineKind === selected.machineKind &&
        capabilityKeys.every(
          (key) => (prior.capabilities[key] === true) === (selected.capabilities[key] === true),
        );
      next.set(id, unchanged ? prior : selected);
      if (!unchanged) changed = true;
    }
    if (changed) {
      previous = next;
      result = collectMachines(next);
    }
    return result;
  }).pipe(Atom.withLabel("thread-list-machines"));
}
