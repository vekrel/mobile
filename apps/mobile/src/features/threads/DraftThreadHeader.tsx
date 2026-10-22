import { uuidv4 } from "../../lib/uuid";
import * as Dialog from "../../components/ui/Dialog";
import { useNavigation } from "@react-navigation/native";
import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";
import { AuthFilesystemReadScope, AuthSourceControlWriteScope } from "@vekrel/contracts";
import type {
  MachineProject,
  MachineThreadShell,
} from "@vekrel/client-runtime/state/shell";
import { NATIVE_LIQUID_GLASS_SUPPORTED } from "../../native/native-glass";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";
import { useMachineQuery } from "../../state/query";
import { useMachineScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { vcsActionManager, vcsMachine } from "../../state/vcs";
import { useVcsActionState } from "../../state/use-vcs-action-state";
import { ThreadHeader } from "./ThreadHeader";

export function DraftThreadHeader(props: {
  readonly thread: MachineThreadShell;
  readonly project: MachineProject;
  readonly cwd: string | null;
}) {
  const navigation = useNavigation();
  const { themeVariables } = useAppearancePreferences();
  const machineId = props.thread.machineId;
  const canReadFiles = useMachineScope(machineId, AuthFilesystemReadScope);
  const canWriteGit = useMachineScope(machineId, AuthSourceControlWriteScope);
  const status = useMachineQuery(
    props.cwd ? vcsMachine.status({ machineId, input: { cwd: props.cwd } }) : null,
  );
  const target = { machineId, cwd: props.cwd };
  const progress = useVcsActionState(target);
  const runAction = useAtomCommand(vcsActionManager.runStackedAction(target), {
    reportFailure: false,
  });
  const pull = useAtomCommand(vcsMachine.pull, { reportFailure: false });
  const openFiles = () => {
    if (!props.cwd || !canReadFiles) return;
    navigation.navigate("NewTaskFiles", {
      machineId,
      cwd: props.cwd,
      projectName: props.project.title,
    });
  };
  const requiresThread = () =>
    Dialog.alert("Available after the first message", "This action needs a saved thread.");
  return (
    <ThreadHeader
      draft
      title="New thread"
      subtitle=""
      headerColor={themeVariables["--color-header"]}
      usesNativeHeaderGlass={NATIVE_LIQUID_GLASS_SUPPORTED}
      hasThreadCwd={props.cwd !== null}
      hasWorkspaceRoot={Boolean(props.project.workspaceRoot)}
      fileInspectorSupported={false}
      inspectorMode={null}
      onToggleInspector={openFiles}
      onOpenFilesInspector={openFiles}
      onOpenGitInspector={requiresThread}
      gitControls={{
        machineId,
        threadId: props.thread.id,
        hasThread: false,
        currentBranch: props.thread.branch,
        gitStatus: status.data,
        gitOperationLabel: progress.currentLabel,
        canOpenTerminal: false,
        canOperateTerminal: false,
        canOpenFiles: canReadFiles && props.cwd !== null,
        projectScripts: [],
        terminalSessions: [],
        onOpenFilesInspector: openFiles,
        onOpenGitInspector: requiresThread,
        onOpenTerminal: requiresThread,
        onOpenNewTerminal: requiresThread,
        onRunProjectScript: async () => {
          requiresThread();
        },
        onPull: async () => {
          if (!canWriteGit || !props.cwd) return;
          const result = await pull({ machineId, input: { cwd: props.cwd } });
          if (AsyncResult.isFailure(result))
            Dialog.alert("Could not pull", String(Cause.squash(result.cause)));
        },
        onRunAction: async (input) => {
          if (!canWriteGit || !props.cwd) return null;
          const result = await runAction({ ...input, actionId: uuidv4() });
          if (AsyncResult.isFailure(result)) {
            Dialog.alert("Git action failed", String(Cause.squash(result.cause)));
            return null;
          }
          return result.value;
        },
      }}
    />
  );
}
