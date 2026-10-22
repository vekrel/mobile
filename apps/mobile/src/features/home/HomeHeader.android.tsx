import type { MenuAction } from "@react-native-menu/menu";
import { useCallback, useMemo } from "react";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { ThreadListToolbar } from "./ThreadListToolbar";
import type { HomeHeaderProps } from "./HomeHeader.types";

export type { HomeHeaderMachine } from "./HomeHeader.types";

function checkedMenuState(checked: boolean) {
  return checked ? ("on" as const) : undefined;
}

export function HomeHeader(props: HomeHeaderProps) {
  const hasCustomListOptions =
    props.selectedMachineId !== null || props.selectedProjectKey !== null;
  const menuActions = useMemo<MenuAction[]>(
    () => [
      {
        id: "machine",
        title: "Machine",
        subactions: [
          {
            id: "machine:all",
            title: "All machines",
            state: checkedMenuState(props.selectedMachineId === null),
          },
          ...props.machines.map((machine) => ({
            id: `machine:${machine.machineId}`,
            title: machine.label,
            state: checkedMenuState(props.selectedMachineId === machine.machineId),
          })),
        ],
      },
      ...(props.projects.length === 0
        ? []
        : ([
            {
              id: "project",
              title: "Project",
              subactions: [
                {
                  id: "project:all",
                  title: "All projects",
                  state: checkedMenuState(props.selectedProjectKey === null),
                },
                ...props.projects.map((project) => ({
                  id: `project:${project.key}`,
                  title: project.label,
                  state: checkedMenuState(props.selectedProjectKey === project.key),
                })),
              ],
            },
          ] satisfies MenuAction[])),
    ],
    [props.machines, props.projects, props.selectedMachineId, props.selectedProjectKey],
  );
  const handleMenuAction = useCallback(
    (event: { nativeEvent: { event: string } }) => {
      const id = event.nativeEvent.event;
      if (id === "machine:all") {
        props.onMachineChange(null);
        return;
      }

      if (id.startsWith("machine:")) {
        const machineId = id.slice("machine:".length);
        const machine = props.machines.find(
          (candidate) => candidate.machineId === machineId,
        );
        if (machine) {
          props.onMachineChange(machine.machineId);
        }
        return;
      }

      if (id === "project:all") {
        props.onProjectChange(null);
        return;
      }

      if (id.startsWith("project:")) {
        const projectKey = id.slice("project:".length);
        if (props.projects.some((project) => project.key === projectKey)) {
          props.onProjectChange(projectKey);
        }
        return;
      }
    },
    [props],
  );

  return (
    <>
      <NativeStackScreenOptions options={{ headerShown: false }} />
      <ThreadListToolbar
        searchQuery={props.searchQuery}
        onSearchQueryChange={props.onSearchQueryChange}
        filterActions={menuActions}
        filterCustomized={hasCustomListOptions}
        onFilterAction={handleMenuAction}
        onOpenMachines={props.onOpenMachines}
      />
    </>
  );
}
