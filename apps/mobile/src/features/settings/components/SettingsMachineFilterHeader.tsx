import { useNavigation } from "@react-navigation/native";
import type { NativeStackHeaderItem } from "@react-navigation/native-stack";
import { resolveMachineKind } from "@vekrel/contracts";
import { Platform, Pressable } from "react-native";

import { Menu } from "../../../components/ui/Menu";
import { SymbolView } from "../../../components/ui/AppSymbol";
import { MACHINE_SYMBOLS } from "../../../components/MachineSymbol";
import { NativeStackScreenOptions } from "../../../native/StackHeader";
import { withNativeGlassHeaderItem } from "../../layout/native-glass-header-items";
import { useAdaptiveWorkspaceLayout } from "../../layout/AdaptiveWorkspaceLayout";
import { useSettingsMachineFilter } from "../settings-machine-filter";

export function SettingsMachineFilterHeader(props: {
  readonly closeSettings?: boolean;
  readonly trailingItems?: readonly NativeStackHeaderItem[];
}) {
  const navigation = useNavigation();
  const { layout } = useAdaptiveWorkspaceLayout();
  const closeSettings = props.closeSettings === true && !layout.usesSplitView;
  const {
    availableTargets,
    selectedTargets,
    selectedIds,
    selectAll,
    toggleMachine,
    selectableProjectGroups,
    selectedProjectKey,
    selectProject,
  } = useSettingsMachineFilter();
  if (Platform.OS !== "ios") return null;

  const filterIcon =
    selectedIds === null && selectedProjectKey === null
      ? "line.3.horizontal.decrease"
      : "line.3.horizontal.decrease.circle.fill";
  const filterVersion = JSON.stringify({
    closeSettings,
    selection: selectedIds === null ? null : [...selectedIds].sort(),
    targets: availableTargets.map((entry) => [
      entry.machineId,
      entry.label,
      entry.displayUrl,
      resolveMachineKind(entry.serverConfig),
    ]),
    project: selectedProjectKey,
    projects: selectableProjectGroups.map((group) => [group.key, group.label]),
    trailingItems: props.trailingItems,
  });

  return (
    <NativeStackScreenOptions
      optionsVersion={filterVersion}
      options={{
        unstable_headerRightItems: () => [
          withNativeGlassHeaderItem({
            accessibilityLabel: "Filter settings machines and projects",
            icon: { name: filterIcon, type: "sfSymbol" },
            label: "",
            type: "menu",
            menu: {
              title: "Settings scope",
              items: [
                {
                  type: "submenu",
                  label:
                    selectedIds === null
                      ? "All machines"
                      : `${selectedTargets.length} ${selectedTargets.length === 1 ? "machine" : "machines"}`,
                  items: [
                    {
                      type: "action",
                      label: "All connected machines",
                      state: selectedIds === null ? "on" : undefined,
                      onPress: selectAll,
                    },
                    ...availableTargets.map((entry) => ({
                      type: "action" as const,
                      label: entry.label,
                      icon: {
                        type: "sfSymbol" as const,
                        name: MACHINE_SYMBOLS[
                          resolveMachineKind(entry.serverConfig)
                        ],
                      },
                      description: entry.displayUrl ?? undefined,
                      state:
                        selectedIds === null || selectedIds.has(entry.machineId)
                          ? ("on" as const)
                          : undefined,
                      onPress: () => toggleMachine(entry.machineId),
                    })),
                  ],
                },
                {
                  type: "submenu",
                  label:
                    selectableProjectGroups.find((group) => group.key === selectedProjectKey)
                      ?.label ??
                    (selectedProjectKey === null ? "All projects" : "Unavailable project"),
                  items: [
                    {
                      type: "action",
                      label: "All projects",
                      state: selectedProjectKey === null ? "on" : undefined,
                      onPress: () => selectProject(null),
                    },
                    ...selectableProjectGroups.map((group) => ({
                      type: "action" as const,
                      label: group.label,
                      state: selectedProjectKey === group.key ? ("on" as const) : undefined,
                      onPress: () => selectProject(group.key),
                    })),
                  ],
                },
              ],
            },
          }),
          ...(props.trailingItems ?? []),
          ...(closeSettings
            ? [
                withNativeGlassHeaderItem({
                  accessibilityLabel: "Close settings",
                  icon: { name: "xmark", type: "sfSymbol" },
                  identifier: "settings-close",
                  label: "",
                  onPress: () => navigation.goBack(),
                  type: "button",
                }),
              ]
            : []),
        ],
      }}
    />
  );
}

export function AndroidSettingsMachineFilter() {
  const {
    availableTargets,
    selectedIds,
    selectAll,
    toggleMachine,
    selectableProjectGroups,
    selectedProjectKey,
    selectProject,
  } = useSettingsMachineFilter();
  const filterIcon =
    selectedIds === null && selectedProjectKey === null
      ? "line.3.horizontal.decrease"
      : "line.3.horizontal.decrease.circle.fill";

  return (
    <Menu
      accessible
      accessibilityRole="button"
      accessibilityLabel="Filter settings machines and projects"
      title="Settings scope"
      actions={[
        {
          id: "all",
          title: "All connected machines",
          state: selectedIds === null ? ("on" as const) : ("off" as const),
        },
        ...availableTargets.map((entry) => ({
          id: `machine:${entry.machineId}`,
          title: `Machine · ${entry.label}`,
          image: MACHINE_SYMBOLS[resolveMachineKind(entry.serverConfig)],
          subtitle: entry.displayUrl ?? undefined,
          state:
            selectedIds === null || selectedIds.has(entry.machineId)
              ? ("on" as const)
              : ("off" as const),
        })),
        {
          id: "project:all",
          title: "All projects",
          state: selectedProjectKey === null ? ("on" as const) : ("off" as const),
        },
        ...selectableProjectGroups.map((group) => ({
          id: `project:${group.key}`,
          title: `Project · ${group.label}`,
          state: selectedProjectKey === group.key ? ("on" as const) : ("off" as const),
        })),
      ]}
      onPressAction={({ nativeEvent }) => {
        if (nativeEvent.event === "all") selectAll();
        else if (nativeEvent.event === "project:all") selectProject(null);
        else if (nativeEvent.event.startsWith("project:")) {
          const group = selectableProjectGroups.find(
            (entry) => `project:${entry.key}` === nativeEvent.event,
          );
          if (group) selectProject(group.key);
        } else {
          const target = availableTargets.find(
            (entry) => `machine:${entry.machineId}` === nativeEvent.event,
          );
          if (target) toggleMachine(target.machineId);
        }
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Filter settings machines and projects"
        className="size-11 items-center justify-center rounded-full"
      >
        <SymbolView name={filterIcon} size={22} tintColorClassName="accent-icon" />
      </Pressable>
    </Menu>
  );
}
