import type { MachineId } from "@vekrel/contracts";

export interface HomeListFilterMenuMachine {
  readonly machineId: MachineId;
  readonly label: string;
}

export interface HomeListFilterMenuProject {
  readonly key: string;
  readonly label: string;
}

type HomeListFilterMenuAction = {
  readonly type: "action";
  readonly title: string;
  readonly subtitle?: string;
  readonly state?: "on" | "off";
  readonly onPress: () => void;
};

type HomeListFilterMenuSubmenu = {
  readonly type: "submenu";
  readonly title: string;
  readonly items: HomeListFilterMenuAction[];
};

export interface HomeListFilterMenu {
  readonly title: string;
  readonly items: Array<HomeListFilterMenuAction | HomeListFilterMenuSubmenu>;
}

export function buildHomeListFilterMenu(props: {
  readonly machines: ReadonlyArray<HomeListFilterMenuMachine>;
  readonly projects: ReadonlyArray<HomeListFilterMenuProject>;
  readonly selectedMachineId: MachineId | null;
  readonly selectedProjectKey: string | null;
  readonly onMachineChange: (machineId: MachineId | null) => void;
  readonly onProjectChange: (projectKey: string | null) => void;
}): HomeListFilterMenu {
  const items: Array<HomeListFilterMenuAction | HomeListFilterMenuSubmenu> = [];

  items.push({
    type: "submenu",
    title: "Machine",
    items: [
      {
        type: "action",
        title: "All machines",
        subtitle: "Show threads from every machine",
        state: props.selectedMachineId === null ? "on" : "off",
        onPress: () => props.onMachineChange(null),
      },
      ...props.machines.map((machine) => ({
        type: "action" as const,
        title: machine.label,
        state:
          props.selectedMachineId === machine.machineId
            ? ("on" as const)
            : ("off" as const),
        onPress: () => props.onMachineChange(machine.machineId),
      })),
    ],
  });

  if (props.projects.length > 0) {
    items.push({
      type: "submenu",
      title: "Project",
      items: [
        {
          type: "action",
          title: "All projects",
          subtitle: "Show threads from every project",
          state: props.selectedProjectKey === null ? "on" : "off",
          onPress: () => props.onProjectChange(null),
        },
        ...props.projects.map((project) => ({
          type: "action" as const,
          title: project.label,
          state: props.selectedProjectKey === project.key ? ("on" as const) : ("off" as const),
          onPress: () => props.onProjectChange(project.key),
        })),
      ],
    });
  }

  return {
    title: "Thread list options",
    items,
  };
}
