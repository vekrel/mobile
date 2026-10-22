import type { MachineId } from "@vekrel/contracts";
import { buildProjectGroups } from "@vekrel/client-runtime/state/project-grouping";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { useMachines, type MachinePresentation } from "../../state/machines";
import { useProjects } from "../../state/entities";
import { useMobileProjectGroupingSettings } from "../../state/project-grouping";
import { toggleSettingsMachine } from "./settings-machine-filter.logic";

export type SettingsTarget = MachinePresentation & {
  readonly serverConfig: NonNullable<MachinePresentation["serverConfig"]>;
};

function connectedSettingsTargets(machines: readonly MachinePresentation[]) {
  return machines.filter(
    (entry): entry is SettingsTarget =>
      entry.connection.phase === "connected" && entry.serverConfig !== null,
  );
}

const SettingsMachineFilterContext = createContext<{
  readonly availableTargets: readonly SettingsTarget[];
  readonly selectedTargets: readonly SettingsTarget[];
  readonly selectedIds: ReadonlySet<MachineId> | null;
  readonly projectGroups: ReturnType<typeof buildProjectGroups>;
  readonly selectableProjectGroups: ReturnType<typeof buildProjectGroups>;
  readonly selectedProjectKey: string | null;
  readonly selectProject: (projectKey: string | null) => void;
  readonly selectAll: () => void;
  readonly toggleMachine: (machineId: MachineId) => void;
} | null>(null);

export function SettingsMachineFilterProvider(props: { readonly children: ReactNode }) {
  const { machines } = useMachines();
  const projects = useProjects();
  const groupingSettings = useMobileProjectGroupingSettings();
  const groupingMode = groupingSettings.sidebarProjectGroupingMode;
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<MachineId> | null>(null);
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | null>(null);
  const projectGroups = useMemo(
    () =>
      buildProjectGroups({
        projects,
        settings: { sidebarProjectGroupingMode: groupingMode, sidebarProjectGroupingOverrides: {} },
      }),
    [projects, groupingMode],
  );
  const availableTargets = useMemo(() => connectedSettingsTargets(machines), [machines]);
  const selectedTargets = useMemo(
    () =>
      availableTargets.filter(
        (entry) => selectedIds === null || selectedIds.has(entry.machineId),
      ),
    [availableTargets, selectedIds],
  );
  const selectableProjectGroups = useMemo(
    () =>
      projectGroups.filter((group) =>
        group.members.some((member) =>
          selectedTargets.some((target) => target.machineId === member.project.machineId),
        ),
      ),
    [projectGroups, selectedTargets],
  );
  const value = useMemo(
    () => ({
      availableTargets,
      selectedTargets,
      selectedIds,
      projectGroups,
      selectableProjectGroups,
      selectedProjectKey,
      selectProject: setSelectedProjectKey,
      selectAll: () => setSelectedIds(null),
      toggleMachine: (machineId: MachineId) =>
        setSelectedIds((current) =>
          toggleSettingsMachine(current, availableTargets, machineId),
        ),
    }),
    [
      availableTargets,
      selectedTargets,
      selectedIds,
      projectGroups,
      selectableProjectGroups,
      selectedProjectKey,
    ],
  );
  return (
    <SettingsMachineFilterContext value={value}>
      {props.children}
    </SettingsMachineFilterContext>
  );
}

export function useSettingsMachineFilter() {
  const filter = useContext(SettingsMachineFilterContext);
  if (filter === null) throw new Error("Settings machine filter provider is missing.");
  return filter;
}
