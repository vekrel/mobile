import type { MachineId } from "@vekrel/contracts";
import type {
  HomeListFilterMenuMachine,
  HomeListFilterMenuProject,
} from "./home-list-filter-menu";

export type HomeHeaderMachine = HomeListFilterMenuMachine;

export interface HomeHeaderProps {
  readonly machines: ReadonlyArray<HomeHeaderMachine>;
  readonly projects: ReadonlyArray<HomeListFilterMenuProject>;
  readonly searchQuery: string;
  readonly selectedMachineId: MachineId | null;
  readonly selectedProjectKey: string | null;
  readonly onSearchQueryChange: (query: string) => void;
  readonly onMachineChange: (machineId: MachineId | null) => void;
  readonly onProjectChange: (projectKey: string | null) => void;
  readonly onOpenMachines: () => void;
  readonly onOpenSettings: () => void;
  readonly onStartNewTask: () => void;
}
