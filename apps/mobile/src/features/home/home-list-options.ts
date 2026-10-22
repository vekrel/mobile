import type { MachineId, SidebarProjectGroupingMode } from "@vekrel/contracts";
import { DEFAULT_SIDEBAR_PROJECT_SORT_ORDER } from "@vekrel/contracts";
import { useAtomSet } from "@effect/atom-react";
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { ThreadListFilters } from "../../persistence/mobile-preferences";
import { updateMobilePreferencesAtom } from "../../state/preferences";
import type { HomeProjectSortOrder } from "./homeThreadList";

export interface HomeListOptions {
  readonly selectedMachineId: MachineId | null;
  readonly selectedProjectKey: string | null;
  readonly projectSortOrder: HomeProjectSortOrder;
}

export interface ResolvedHomeListOptions extends HomeListOptions {
  readonly projectGroupingMode: SidebarProjectGroupingMode;
}

function defaultHomeListOptions(filters?: ThreadListFilters): HomeListOptions {
  return {
    selectedMachineId: filters?.machineId ?? null,
    selectedProjectKey: filters?.projectKey ?? null,
    projectSortOrder:
      DEFAULT_SIDEBAR_PROJECT_SORT_ORDER === "manual"
        ? "updated_at"
        : DEFAULT_SIDEBAR_PROJECT_SORT_ORDER,
  };
}

interface HomeListOptionsContextValue {
  readonly options: HomeListOptions;
  readonly setOptions: Dispatch<SetStateAction<HomeListOptions>>;
  readonly projectGroupingMode: SidebarProjectGroupingMode;
}

const HomeListOptionsContext = createContext<HomeListOptionsContextValue | null>(null);

export function HomeListOptionsProvider({
  children,
  projectGroupingMode,
  savedFilters,
}: PropsWithChildren<{
  readonly projectGroupingMode: SidebarProjectGroupingMode;
  readonly savedFilters?: ThreadListFilters | undefined;
}>) {
  const [options, setOptions] = useState(() => defaultHomeListOptions(savedFilters));
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const saved = useRef(savedFilters);
  const { selectedMachineId: machineId, selectedProjectKey: projectKey } = options;
  useEffect(() => {
    if (
      (saved.current?.machineId ?? null) === machineId &&
      (saved.current?.projectKey ?? null) === projectKey
    )
      return;
    saved.current = { machineId, projectKey };
    savePreferences({ threadListFilters: saved.current });
  }, [machineId, projectKey, savePreferences]);
  const value = { options, setOptions, projectGroupingMode };
  return createElement(HomeListOptionsContext, { value }, children);
}

export function useHomeListOptions(availableMachineIds: ReadonlySet<MachineId>) {
  const shared = useContext(HomeListOptionsContext);
  const [localOptions, setLocalOptions] = useState<HomeListOptions>(defaultHomeListOptions);
  const options = shared?.options ?? localOptions;
  const setOptions = shared?.setOptions ?? setLocalOptions;
  const selectedMachineId =
    options.selectedMachineId !== null &&
    availableMachineIds.has(options.selectedMachineId)
      ? options.selectedMachineId
      : null;
  const availableOptions =
    selectedMachineId === options.selectedMachineId
      ? options
      : { ...options, selectedMachineId };
  const resolvedOptions: ResolvedHomeListOptions = {
    ...availableOptions,
    projectGroupingMode: shared?.projectGroupingMode ?? "repository",
  };

  const setSelectedMachineId = (value: MachineId | null) => {
    setOptions((current) => ({ ...current, selectedMachineId: value }));
  };
  const setSelectedProjectKey = (value: string | null) => {
    setOptions((current) => ({ ...current, selectedProjectKey: value }));
  };
  const setProjectSortOrder = (value: HomeProjectSortOrder) => {
    setOptions((current) => ({ ...current, projectSortOrder: value }));
  };
  return {
    options: resolvedOptions,
    setSelectedMachineId,
    setSelectedProjectKey,
    setProjectSortOrder,
  } as const;
}
