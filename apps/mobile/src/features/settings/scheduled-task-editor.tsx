import { useAtomValue } from "@effect/atom-react";
import type { MachineId } from "@vekrel/contracts";
import {
  createContext,
  use,
  useMemo,
  useCallback,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { useProjects, useServerConfigs } from "../../state/entities";
import {
  createDraft,
  scheduledTaskDefaultModel,
  hasScheduledTaskDraftChanges,
  type ScheduledTaskDraft,
} from "./scheduledTaskDraft";
import { useSettingsMachineFilter } from "./settings-machine-filter";
import { settingsTargetsForProject } from "./settings-machine-filter.logic";

import {
  scheduledTaskEditorSessionAtom,
  startScheduledTaskEditor,
  updateScheduledTaskEditor,
  readScheduledTaskEditor,
  type ScheduledTaskEditor,
} from "./scheduled-task-editor-state";

const ScheduledTaskEditorContext = createContext<{
  readonly editor: ScheduledTaskEditor | null;
  readonly voiceOwnerKey: string;
  readonly readEditor: () => ScheduledTaskEditor | null;
  readonly setEditor: Dispatch<SetStateAction<ScheduledTaskEditor | null>>;
  readonly startEditor: (editor: ScheduledTaskEditor | null) => void;
  readonly hasChanges: boolean;
  readonly resetEditor: () => void;
  readonly draftForMachine: (machineId: MachineId) => ScheduledTaskDraft;
} | null>(null);

/** Keeps the form draft alive while its native picker routes are on top. */
export function ScheduledTaskEditorProvider({ children }: { readonly children: ReactNode }) {
  const { selectedTargets, selectedProjectKey, projectGroups } = useSettingsMachineFilter();
  const selectedGroup = projectGroups.find((group) => group.key === selectedProjectKey);
  const configs = useServerConfigs();
  const projects = useProjects();
  const defaultTarget = settingsTargetsForProject(
    selectedTargets,
    selectedProjectKey === null ? null : selectedGroup,
  )[0];
  const draftForMachine = useCallback(
    (machineId: MachineId) => {
      const machineProjects = projects.filter(
        (project) => project.machineId === machineId,
      );
      const project =
        machineProjects.find((project) =>
          selectedGroup?.members.some(
            (member) =>
              member.project.machineId === machineId && member.project.id === project.id,
          ),
        ) ?? machineProjects[0];
      return createDraft(
        project?.id ?? null,
        scheduledTaskDefaultModel(configs.get(machineId) ?? null, project ?? null),
      );
    },
    [configs, projects, selectedGroup],
  );
  // Direct links can open the new-task form before machines have connected.
  const defaultEditor = useMemo(
    () =>
      defaultTarget
        ? {
            machineId: defaultTarget.machineId,
            machineLabel: defaultTarget.label,
            draft: draftForMachine(defaultTarget.machineId),
          }
        : null,
    [defaultTarget, draftForMachine],
  );
  const session = useAtomValue(scheduledTaskEditorSessionAtom);
  const voiceOwnerKey = `scheduled-task:${session?.id ?? 0}`;
  const editor = session ? session.current : defaultEditor;
  const initial = session ? session.initial : defaultEditor;
  const hasChanges = Boolean(
    initial &&
    editor &&
    (initial.machineId !== editor.machineId ||
      hasScheduledTaskDraftChanges(initial.draft, editor.draft)),
  );
  const setEditor = useCallback<Dispatch<SetStateAction<ScheduledTaskEditor | null>>>(
    (update) => {
      updateScheduledTaskEditor(update, defaultEditor);
    },
    [defaultEditor],
  );
  const startEditor = startScheduledTaskEditor;
  const resetEditor = useCallback(() => startEditor(defaultEditor), [defaultEditor, startEditor]);
  const readEditor = useCallback(
    () => readScheduledTaskEditor(voiceOwnerKey, defaultEditor),
    [defaultEditor, voiceOwnerKey],
  );
  const value = useMemo(
    () => ({
      editor,
      voiceOwnerKey,
      readEditor,
      setEditor,
      startEditor,
      hasChanges,
      resetEditor,
      draftForMachine,
    }),
    [
      editor,
      voiceOwnerKey,
      readEditor,
      setEditor,
      startEditor,
      hasChanges,
      resetEditor,
      draftForMachine,
    ],
  );
  return <ScheduledTaskEditorContext value={value}>{children}</ScheduledTaskEditorContext>;
}

export function useScheduledTaskEditor() {
  const context = use(ScheduledTaskEditorContext);
  if (!context) throw new Error("Scheduled task editor provider is missing.");
  return context;
}
