import * as Dialog from "../../components/ui/Dialog";
import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { NavigationRow } from "../../components/ui/NavigationRow";
import { SettingsScreen } from "../settings/components/SettingsScreen";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { Button } from "../../components/ui/Button";
import {
  addProjectRemoteSourceLabel,
  addProjectRemoteSourcePathHint,
  addProjectRemoteSourceProvider,
  buildAddProjectRemoteSourceReadiness,
  buildProjectCreateCommand,
  canCreateProjectInMachine,
  findExistingAddProject,
  getAddProjectInitialQuery,
  getCloneDestinationBrowsePath,
  getCloneDestinationPath,
  getCloneDirectoryName,
  getDefaultCloneUrl,
  getNewProjectPathPreview,
  getNewProjectPublishTarget,
  getNewProjectPublishTargets,
  getNewProjectRepository,
  normalizePastedCloneUrl,
  parseAddProjectRemoteSource,
  resolveAddProjectPath,
  sortAddProjectProviderSources,
  type AddProjectRemoteSource,
} from "@vekrel/client-runtime/operations/projects";
import {
  connectionStatusText,
  type MachineConnectionPhase,
} from "@vekrel/client-runtime/connection";
import {
  canPreloadBrowsePath,
  createBrowseNavigationCoordinator,
  filterFilesystemBrowseEntries,
  getFilesystemBrowsePath,
  resolveFilesystemReadAccess,
} from "@vekrel/client-runtime/state/filesystem";
import {
  appendBrowsePathSegment,
  inferProjectTitleFromPath,
  isWindowsPlatform,
} from "@vekrel/client-runtime/state/projects";
import {
  AuthOrchestrationOperateScope,
  AuthSourceControlWriteScope,
  AuthFilesystemReadScope,
  CommandId,
  type MachineId,
  type MachineKind,
  ProjectId,
  resolveMachineKind,
  SourceControlProviderKind,
} from "@vekrel/contracts";
import {
  CommonActions,
  StackActions,
  useNavigation,
  type NavigationState,
  type ParamListBase,
} from "@react-navigation/native";
import { SymbolView } from "../../components/ui/AppSymbol";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Arr from "effect/Array";
import * as Cause from "effect/Cause";
import * as Order from "effect/Order";
import { AsyncResult } from "effect/reactivity";
import { cn } from "../../lib/cn";
import { useProjects, useServerConfigs, waitForProject } from "../../state/entities";
import { filesystemMachine } from "../../state/filesystem";
import { projectMachine } from "../../state/projects";
import { useMachineQuery } from "../../state/query";
import { machineSession, useMachineScope, readMachineScope } from "../../state/session";
import { useMachinePresentation } from "../../state/presentation";
import { sourceControlMachine } from "../../state/sourceControl";
import { AppText as Text, AppTextInput as TextInput } from "../../components/ui/AppText";
import { MachineSymbol } from "../../components/MachineSymbol";
import { ErrorBanner } from "../../components/ui/ErrorBanner";
import { SourceControlIcon } from "./SourceControlIcon";
import { sourceControlClients } from "@vekrel/client-runtime/source-control-clients";
import { ThemedSwitch } from "../../components/ui/ThemedSwitch";
import { uuidv4 } from "../../lib/uuid";
import { useAtomCommand } from "../../state/use-atom-command";
import { useAtomQueryRunner } from "../../state/use-atom-query-runner";
import {
  useRemoteConnectionStatus,
  useRemoteMachineRuntime,
  useSavedRemoteConnections,
} from "../../state/use-remote-machine-registry";
import { resolveAddProjectMachine } from "./AddProjectScreen.logic";
import {
  createNewTaskDraft,
  setComposerDraftText,
  waitForComposerDraftsLoaded,
} from "../../state/use-composer-drafts";

interface MachineOption {
  readonly machineId: MachineId;
  readonly label: string;
  readonly platform: string;
  readonly machine: MachineKind;
  readonly baseDirectory: string | null;
  readonly newProjectsRoot: string | null;
  readonly connectionState: MachineConnectionPhase;
  readonly connectionError: string | null;
  readonly connectionErrorTraceId: string | null;
  readonly supportsCloneTracking: boolean;
}

const machineOptionOrder = Order.mapInput(
  Order.Struct({
    label: Order.String,
  }),
  (machine: MachineOption) => ({ label: machine.label }),
);

function platformFromOs(os: string | null | undefined): string {
  if (os === "windows") return "Win32";
  if (os === "darwin") return "MacIntel";
  if (os === "linux") return "Linux";
  return "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "An error occurred.";
}

function stringParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function sourceFromParam(value: string | string[] | undefined): AddProjectRemoteSource {
  return parseAddProjectRemoteSource(stringParam(value));
}

function SectionTitle(props: { readonly children: string }) {
  return (
    <Text
      className={
        Platform.OS === "android"
          ? "px-4 text-sm font-t3-medium text-primary-text"
          : "px-1 text-2xs font-t3-bold tracking-[0.7px] uppercase text-foreground-muted"
      }
    >
      {props.children}
    </Text>
  );
}

function AddProjectShell(props: { readonly children: ReactNode; readonly title: string }) {
  const insets = useSafeAreaInsets();

  return (
    // collapsable={false} is load-bearing: if this wrapper is flattened, the
    // ScrollView lands directly under RNSSafeAreaView and RNS's formSheet
    // scroll-view frame correction mistakes this full-height wrapper for a
    // "header" sibling, coercing the ScrollView to zero height (blank sheet
    // as soon as the sheet re-lays-out, e.g. when the keyboard opens).
    <SettingsScreen title={props.title}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: Platform.OS === "android" ? 16 : 20,
          paddingTop: 16,
          paddingBottom: Math.max(insets.bottom, 18) + 18,
          gap: Platform.OS === "android" ? 16 : 10,
        }}
      >
        {props.children}
      </ScrollView>
    </SettingsScreen>
  );
}

function ListSection(props: { readonly children: ReactNode }) {
  return (
    <View
      className={
        Platform.OS === "android"
          ? "overflow-hidden rounded-[28px] bg-grouped-card"
          : "overflow-hidden rounded-[24px] bg-grouped-card"
      }
    >
      {props.children}
    </View>
  );
}

function ListRow(props: {
  readonly title: string;
  readonly subtitle?: string | null;
  readonly icon: ReactNode;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly isFirst?: boolean;
  readonly right?: ReactNode;
  readonly onPress?: () => void;
}) {
  if (Platform.OS === "android") {
    return (
      <NavigationRow
        className="bg-grouped-card"
        title={props.title}
        subtitle={props.subtitle}
        leading={props.icon}
        trailing={props.right}
        disabled={props.disabled}
        onPress={props.onPress}
        accessibilityRole={props.selected !== undefined ? "radio" : "button"}
        accessibilityState={props.selected !== undefined ? { checked: props.selected } : undefined}
      />
    );
  }
  return (
    <Pressable
      disabled={props.disabled}
      onPress={props.onPress}
      className={cn(
        "bg-grouped-card px-3.5 py-2.5 active:opacity-70",
        !props.isFirst && "border-t border-border-subtle",
        props.disabled && "opacity-[0.45]",
      )}
    >
      <View className="flex-row items-center gap-3">
        <View
          className={
            props.selected
              ? "h-7 w-7 items-center justify-center rounded-full bg-primary"
              : "h-7 w-7 items-center justify-center"
          }
        >
          {props.icon}
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-base leading-snug font-t3-bold">{props.title}</Text>
          {props.subtitle ? (
            <Text className="text-sm leading-snug text-foreground-muted" numberOfLines={2}>
              {props.subtitle}
            </Text>
          ) : null}
        </View>
        {"right" in props ? (
          props.right
        ) : !props.disabled ? (
          <SymbolView
            name="chevron.right"
            size={13}
            tintColorClassName="accent-chevron"
            type="monochrome"
          />
        ) : null}
      </View>
    </Pressable>
  );
}

function PrimaryActionButton(props: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly onPress: () => void;
}) {
  return <Button {...props} tone="primary" fullWidth />;
}

function ProjectPathInput(props: {
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly onSubmit: () => void;
}) {
  return (
    <TextInput
      className="h-12 min-h-12 rounded-[24px] px-4 py-0 text-base leading-snug"
      value={props.value}
      onChangeText={props.onChangeText}
      autoCapitalize="none"
      autoCorrect={false}
      placeholder="~/projects/my-app"
      returnKeyType="done"
      onSubmitEditing={props.onSubmit}
    />
  );
}

function useBrowsePathInput(machine: MachineOption | null, pinnedDirectoryName = "") {
  const machineId = machine?.machineId ?? null;
  const machineBaseDirectory = machine?.baseDirectory ?? null;
  const clonePathCaseSensitive = !isWindowsPlatform(machine?.platform ?? "");
  const [pathInput, commitPathInput] = useState(() =>
    getCloneDestinationPath(
      getAddProjectInitialQuery(machineBaseDirectory),
      pinnedDirectoryName,
    ),
  );
  const previousMachineIdRef = useRef(machineId);
  const machineRuntime = useRemoteMachineRuntime(machineId);
  const loadBrowsePath = useAtomQueryRunner(filesystemMachine.browse, {
    reportFailure: false,
    reportDefect: false,
  });
  const [browseNavigation] = useState(createBrowseNavigationCoordinator);
  const [isBrowseNavigating, setIsBrowseNavigating] = useState(false);
  const setPathInput = (path: string) => {
    browseNavigation.invalidate();
    setIsBrowseNavigating(false);
    commitPathInput(path);
  };
  const navigateToBrowsePath = async (input: {
    readonly browseDirectoryPath: string;
    readonly selectedDirectoryName?: string;
  }) => {
    const selectedDirectoryPath = input.selectedDirectoryName
      ? appendBrowsePathSegment(input.browseDirectoryPath, input.selectedDirectoryName)
      : input.browseDirectoryPath;
    const nextPathInput =
      pinnedDirectoryName && input.selectedDirectoryName
        ? getCloneDestinationBrowsePath({
            browseDirectoryPath: input.browseDirectoryPath,
            selectedDirectoryName: input.selectedDirectoryName,
            cloneDirectoryName: pinnedDirectoryName,
            caseSensitive: clonePathCaseSensitive,
          })
        : getCloneDestinationPath(selectedDirectoryPath, pinnedDirectoryName);
    setIsBrowseNavigating(true);
    const committed = await browseNavigation.run(
      async () => {
        if (
          machine &&
          readMachineScope(machine.machineId, AuthFilesystemReadScope) &&
          canPreloadBrowsePath(machineRuntime?.connectionState)
        ) {
          await loadBrowsePath({
            machineId: machine.machineId,
            input: { partialPath: selectedDirectoryPath },
          });
        }
      },
      () => commitPathInput(nextPathInput),
    );
    if (committed) {
      setIsBrowseNavigating(false);
    }
    return committed;
  };

  useEffect(() => {
    if (machineId !== null && machineId !== previousMachineIdRef.current) {
      previousMachineIdRef.current = machineId;
      setPathInput(
        getCloneDestinationPath(
          getAddProjectInitialQuery(machineBaseDirectory),
          pinnedDirectoryName,
        ),
      );
    }
  }, [machineBaseDirectory, machineId, pinnedDirectoryName, setPathInput]);

  useEffect(
    () => () => {
      browseNavigation.invalidate();
    },
    [browseNavigation],
  );

  return { isBrowseNavigating, pathInput, setPathInput, navigateToBrowsePath };
}

function useMachineOptions(): ReadonlyArray<MachineOption> {
  const serverConfigByMachineId = useServerConfigs();
  const { savedConnectionsById } = useSavedRemoteConnections();
  const { connectedMachines } = useRemoteConnectionStatus();

  return ((): ReadonlyArray<MachineOption> => {
    const runtimeByMachineId = new Map(
      connectedMachines.map((machine) => [machine.machineId, machine] as const),
    );
    const options = Object.values(savedConnectionsById).map((connection) => {
      const config = serverConfigByMachineId.get(connection.machineId);
      const runtime = runtimeByMachineId.get(connection.machineId);
      return {
        machineId: connection.machineId,
        label: connection.machineLabel,
        platform: platformFromOs(config?.machine.platform.os ?? null),
        machine: resolveMachineKind(config ?? null),
        baseDirectory: config?.settings.addProjectBaseDirectory ?? null,
        newProjectsRoot: config?.newProjectsRoot ?? null,
        connectionState: runtime?.connectionState ?? "available",
        connectionError: runtime?.connectionError ?? null,
        connectionErrorTraceId: runtime?.connectionErrorTraceId ?? null,
        supportsCloneTracking: config?.machine.capabilities.projectCloneTracking === true,
      };
    });
    return Arr.sort(
      options.filter((machine) => canCreateProjectInMachine(machine.connectionState)),
      machineOptionOrder,
    );
  })();
}

function useSelectedMachine(): {
  readonly machineOptions: ReadonlyArray<MachineOption>;
  readonly selectedMachine: MachineOption | null;
  readonly setSelectedMachineId: (machineId: MachineId) => void;
} {
  const [selectedMachineId, setSelectedMachineId] = useState<MachineId | null>(null);
  const machineOptions = useMachineOptions();
  const selectedMachine =
    machineOptions.find(
      (machine) =>
        machine.machineId === selectedMachineId &&
        canCreateProjectInMachine(machine.connectionState),
    ) ??
    machineOptions.find((machine) =>
      canCreateProjectInMachine(machine.connectionState),
    ) ??
    null;

  return {
    machineOptions,
    selectedMachine,
    setSelectedMachineId,
  };
}

function EmptyMachineState() {
  const navigation = useNavigation();

  return (
    <View className="items-center gap-3 rounded-2xl bg-grouped-card px-5 py-8">
      <Text className="text-center text-lg font-t3-bold">Machine unavailable</Text>
      <Text className="text-center text-sm leading-normal text-foreground-muted">
        Start or reconnect a machine before adding a project.
      </Text>
      <View className="mt-1">
        <Button
          label="Add machine"
          tone="primary"
          onPress={() => navigation.dispatch(StackActions.replace("ConnectionsNew"))}
        />
      </View>
    </View>
  );
}

function SourceControlRow(props: {
  readonly source: AddProjectRemoteSource;
  readonly selectedMachineId: MachineId;
  readonly ready: boolean;
  readonly hint: string;
  readonly isFirst: boolean;
}) {
  const navigation = useNavigation();
  const title =
    props.source === "url" ? "Git URL" : `${addProjectRemoteSourceLabel(props.source)} repository`;
  const subtitle =
    props.source === "url"
      ? "Clone from a remote URL"
      : `Clone ${addProjectRemoteSourceLabel(props.source)} ${props.hint}`;
  const icon =
    props.source === "url" ? (
      <SymbolView
        name="link"
        size={Platform.OS === "android" ? 24 : 17}
        tintColorClassName="accent-icon"
        type="monochrome"
      />
    ) : (
      <SourceControlIcon
        kind={sourceControlClients.get(props.source).icon}
        size={Platform.OS === "android" ? 24 : 18}
        colorClassName="accent-icon"
      />
    );

  if (!props.ready) {
    return (
      <ListRow title={title} subtitle={props.hint} icon={icon} disabled isFirst={props.isFirst} />
    );
  }

  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      icon={icon}
      isFirst={props.isFirst}
      onPress={() =>
        navigation.dispatch(
          StackActions.push("AddProjectRepository", {
            machineId: props.selectedMachineId,
            source: props.source,
          }),
        )
      }
    />
  );
}

export function AddProjectSourceScreen() {
  const navigation = useNavigation();
  const { machineOptions, selectedMachine, setSelectedMachineId } =
    useSelectedMachine();
  const canWriteSourceControl = useMachineScope(
    selectedMachine?.machineId ?? null,
    AuthSourceControlWriteScope,
  );
  const canCreateProject = useMachineScope(
    selectedMachine?.machineId ?? null,
    AuthOrchestrationOperateScope,
  );
  const canCloneProject = canWriteSourceControl && canCreateProject;
  const discoveryState = useMachineQuery(
    selectedMachine === null
      ? null
      : sourceControlMachine.discovery({
          machineId: selectedMachine.machineId,
          input: {},
        }),
  );
  const readiness = buildAddProjectRemoteSourceReadiness(discoveryState.data);

  return (
    <AddProjectShell title="Add project">
      {selectedMachine === null ? <EmptyMachineState /> : null}

      {machineOptions.length > 1 ? (
        <>
          <SectionTitle>Machines</SectionTitle>
          <ListSection>
            {machineOptions.map((machine, index) => (
              <ListRow
                key={machine.machineId}
                title={machine.label}
                subtitle={
                  canCreateProjectInMachine(machine.connectionState)
                    ? undefined
                    : connectionStatusText({
                        phase: machine.connectionState,
                        error: machine.connectionError,
                        traceId: machine.connectionErrorTraceId,
                      })
                }
                icon={
                  <MachineSymbol
                    kind={machine.machine}
                    size={Platform.OS === "android" ? 24 : 17}
                    tintColorClassName="accent-icon"
                  />
                }
                selected={machine.machineId === selectedMachine?.machineId}
                disabled={!canCreateProjectInMachine(machine.connectionState)}
                isFirst={index === 0}
                right={
                  machine.machineId === selectedMachine?.machineId ? (
                    <SymbolView
                      name="checkmark"
                      size={Platform.OS === "android" ? 20 : 14}
                      tintColorClassName="accent-icon"
                      type="monochrome"
                    />
                  ) : null
                }
                onPress={() => setSelectedMachineId(machine.machineId)}
              />
            ))}
          </ListSection>
        </>
      ) : null}

      {selectedMachine ? (
        <>
          <ListSection>
            {selectedMachine.newProjectsRoot !== null ? (
              <ListRow
                title="New project"
                subtitle="Start a new Git repository from a name"
                icon={
                  <SymbolView
                    name="plus"
                    size={Platform.OS === "android" ? 24 : 17}
                    tintColorClassName="accent-icon"
                    type="monochrome"
                  />
                }
                isFirst
                onPress={() =>
                  navigation.dispatch(
                    StackActions.push("AddProjectNew", {
                      machineId: selectedMachine.machineId,
                    }),
                  )
                }
              />
            ) : null}
            <ListRow
              title="Local folder"
              subtitle={
                canCreateProject
                  ? "Browse a folder on disk"
                  : "This connection cannot add projects."
              }
              icon={
                <SymbolView
                  name="folder.badge.plus"
                  size={Platform.OS === "android" ? 24 : 17}
                  tintColorClassName="accent-icon"
                  type="monochrome"
                />
              }
              isFirst={selectedMachine.newProjectsRoot === null}
              disabled={!canCreateProject}
              onPress={() =>
                navigation.dispatch(
                  StackActions.push("AddProjectLocal", {
                    machineId: selectedMachine.machineId,
                  }),
                )
              }
            />
            {(["url", ...sortAddProjectProviderSources(readiness)] as AddProjectRemoteSource[]).map(
              (candidate) => (
                <SourceControlRow
                  key={candidate}
                  source={candidate}
                  selectedMachineId={selectedMachine.machineId}
                  ready={canCloneProject && readiness(candidate).ready}
                  hint={
                    !canCloneProject
                      ? "This connection cannot clone projects."
                      : readiness(candidate).ready
                        ? addProjectRemoteSourcePathHint(candidate)
                        : (readiness(candidate).hint ?? "")
                  }
                  isFirst={false}
                />
              ),
            )}
          </ListSection>
          {discoveryState.isPending ? (
            <AppActivityIndicator colorClassName="accent-icon-muted" />
          ) : null}
        </>
      ) : null}
    </AddProjectShell>
  );
}

function openNewTaskDraft(
  navigation: {
    dispatch: (action: ReturnType<typeof CommonActions.reset>) => void;
    getState: () => NavigationState<ParamListBase> | undefined;
  },
  params: {
    machineId: MachineId;
    projectId: ProjectId;
    title: string;
    cloning?: "1";
    draftId?: string;
  },
) {
  const state = navigation.getState();
  if (!state) return;
  const threadIndex = state.routes.findLastIndex((route) => route.name === "Thread");
  const routes = [
    ...state.routes.slice(0, threadIndex < 0 ? state.index : threadIndex),
    { key: uuidv4(), name: "Thread", params: { draft: params } },
  ];
  navigation.dispatch(CommonActions.reset({ ...state, index: routes.length - 1, routes }));
}

async function draftWithPrompt(
  machineId: MachineId,
  projectId: ProjectId,
  prompt: string,
): Promise<string> {
  await waitForComposerDraftsLoaded();
  const draftId = createNewTaskDraft({ machineId, projectId });
  setComposerDraftText(draftId, prompt);
  return draftId;
}

function useCreateProject(machine: MachineOption | null) {
  const navigation = useNavigation();
  const createProject = useAtomCommand(projectMachine.create, { reportFailure: false });
  const projects = useProjects();

  return async (workspaceRoot: string) => {
    if (
      !machine ||
      !canCreateProjectInMachine(machine.connectionState) ||
      !readMachineScope(machine.machineId, AuthOrchestrationOperateScope)
    ) {
      Dialog.alert(
        "Project not added",
        `This connection cannot add projects right now. Any existing files remain at ${workspaceRoot}.`,
      );
      return;
    }

    const existing = findExistingAddProject({
      projects,
      machineId: machine.machineId,
      path: workspaceRoot,
    });
    if (existing) {
      Dialog.alert("Project already exists", existing.title);
      openNewTaskDraft(navigation, {
        machineId: existing.machineId,
        projectId: existing.id,
        title: existing.title,
      });
      return;
    }

    const projectId = ProjectId.make(uuidv4());
    const command = buildProjectCreateCommand({
      commandId: CommandId.make(uuidv4()),
      projectId,
      workspaceRoot,
    });
    const result = await createProject({
      machineId: machine.machineId,
      input: command,
    });
    if (AsyncResult.isFailure(result)) {
      return result;
    }
    openNewTaskDraft(navigation, {
      machineId: machine.machineId,
      projectId,
      title: inferProjectTitleFromPath(workspaceRoot),
    });
    return result;
  };
}

function useMachineFromParam(
  machineIdParam: string | string[] | undefined,
): MachineOption | null {
  const machineOptions = useMachineOptions();
  const machineId = stringParam(machineIdParam) as MachineId | null;
  return resolveAddProjectMachine(machineOptions, machineId);
}

export function AddProjectRepositoryScreen(props: {
  readonly machineId?: string | string[];
  readonly source?: string | string[];
}) {
  const lookupRepositoryQuery = useAtomQueryRunner(sourceControlMachine.repository, {
    reportFailure: false,
  });
  const navigation = useNavigation();
  const machine = useMachineFromParam(props.machineId);
  const source = sourceFromParam(props.source);
  const [repositoryInput, setRepositoryInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookupRepository = async () => {
    if (!machine || repositoryInput.trim().length === 0 || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    const provider = addProjectRemoteSourceProvider(source);
    if (!provider) {
      const remoteUrl = normalizePastedCloneUrl(repositoryInput);
      navigation.dispatch(
        StackActions.push("AddProjectDestination", {
          machineId: machine.machineId,
          source,
          remoteUrl,
          repositoryTitle: remoteUrl,
          repositoryName: getCloneDirectoryName(remoteUrl),
        }),
      );
      setIsSubmitting(false);
      return;
    }

    const result = await lookupRepositoryQuery({
      machineId: machine.machineId,
      input: {
        provider,
        repository: repositoryInput.trim(),
      },
    });
    if (AsyncResult.isFailure(result)) {
      setError(errorMessage(Cause.squash(result.cause)));
    } else {
      const repository = result.value;
      navigation.dispatch(
        StackActions.push("AddProjectDestination", {
          machineId: machine.machineId,
          source,
          remoteUrl: getDefaultCloneUrl(repository),
          repositoryTitle: repository.nameWithOwner,
          repositoryName: getCloneDirectoryName(repository.nameWithOwner),
        }),
      );
    }
    setIsSubmitting(false);
  };

  return (
    <AddProjectShell title={source === "url" ? "Git URL" : addProjectRemoteSourceLabel(source)}>
      {error ? <ErrorBanner message={error} /> : null}
      {machine ? (
        <>
          <TextInput
            className="h-12 min-h-12 rounded-[24px] px-4 py-0 text-base leading-snug"
            value={repositoryInput}
            onChangeText={setRepositoryInput}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={
              source === "url"
                ? "https://github.com/org/repo.git"
                : addProjectRemoteSourcePathHint(source)
            }
            returnKeyType="next"
            onSubmitEditing={() => void lookupRepository()}
          />
          <PrimaryActionButton
            label={source === "url" ? "Continue" : "Lookup repository"}
            disabled={isSubmitting || repositoryInput.trim().length === 0}
            onPress={() => void lookupRepository()}
            loading={isSubmitting}
          />
        </>
      ) : (
        <EmptyMachineState />
      )}
    </AddProjectShell>
  );
}

function FolderBrowser(props: {
  readonly machine: MachineOption;
  readonly pathInput: string;
  readonly setPathInput: (path: string) => void;
  readonly navigateToBrowsePath: (input: {
    readonly browseDirectoryPath: string;
    readonly selectedDirectoryName?: string;
  }) => Promise<boolean>;
  readonly pinnedDirectoryName?: string;
}) {
  const browsePath = getFilesystemBrowsePath(props.pathInput, props.machine.platform);
  const browseInput =
    browsePath.directoryPath.length > 0 ? { partialPath: browsePath.directoryPath } : null;
  const fileAccessSession = useMachineQuery(
    machineSession.sessionStateAtom(props.machine.machineId),
  );
  const fileMachine = useMachinePresentation(props.machine.machineId);
  const fileAccess = resolveFilesystemReadAccess({
    isCatalogReady: fileMachine.isReady,
    connection: fileMachine.presentation?.connection ?? null,
    session: fileAccessSession.data,
    sessionError: fileAccessSession.error,
  });
  const { canReadFiles } = fileAccess;
  const browseState = useMachineQuery(
    !canReadFiles || browseInput === null
      ? null
      : filesystemMachine.browse({
          machineId: props.machine.machineId,
          input: browseInput,
        }),
  );
  const pinnedDirectoryName = props.pinnedDirectoryName ?? "";
  const pinnedDirectoryMatches = isWindowsPlatform(props.machine.platform)
    ? browsePath.filterQuery.toLowerCase() === pinnedDirectoryName.toLowerCase()
    : browsePath.filterQuery === pinnedDirectoryName;
  const browseFilterQuery = pinnedDirectoryMatches ? "" : browsePath.filterQuery;
  const { visibleEntries: visibleBrowseEntries } = filterFilesystemBrowseEntries(
    browseState.data?.entries ?? [],
    browseFilterQuery,
  );

  return (
    <>
      <SectionTitle>Browse folders</SectionTitle>
      {!canReadFiles && !fileAccess.isPending ? (
        <ErrorBanner message={fileAccess.error ?? "This connection cannot browse host folders."} />
      ) : null}
      {browseState.error ? <ErrorBanner message={browseState.error} /> : null}
      <ListSection>
        {fileAccess.isPending || (browseState.isPending && browseState.data === null) ? (
          <View className="items-center py-5">
            <AppActivityIndicator colorClassName="accent-icon-muted" />
          </View>
        ) : null}
        {browsePath.canBrowseUp ? (
          <ListRow
            title=".."
            icon={
              <SymbolView
                name="arrow.turn.left.up"
                size={Platform.OS === "android" ? 24 : 17}
                tintColorClassName="accent-icon-muted"
                type="monochrome"
              />
            }
            isFirst
            right={null}
            onPress={() => {
              if (browsePath.parentPath) {
                void props.navigateToBrowsePath({
                  browseDirectoryPath: browsePath.parentPath,
                });
              }
            }}
          />
        ) : null}
        {visibleBrowseEntries.map((entry, index) => (
          <ListRow
            key={entry.fullPath}
            title={entry.name}
            icon={
              <SymbolView
                name="folder"
                size={Platform.OS === "android" ? 24 : 17}
                tintColorClassName="accent-icon-muted"
                type="monochrome"
              />
            }
            isFirst={index === 0 && !browsePath.canBrowseUp}
            right={null}
            onPress={() => {
              void props.navigateToBrowsePath({
                browseDirectoryPath: browsePath.directoryPath,
                selectedDirectoryName: entry.name,
              });
            }}
          />
        ))}
      </ListSection>
    </>
  );
}

export function AddProjectNewScreen(props: { readonly machineId?: string | string[] }) {
  const navigation = useNavigation();
  const machineOptions = useMachineOptions().filter(
    (option) => option.newProjectsRoot !== null,
  );
  const [selectedMachineId, setSelectedMachineId] = useState(
    () => stringParam(props.machineId) as MachineId | null,
  );
  const machine = resolveAddProjectMachine(machineOptions, selectedMachineId);
  const createNew = useAtomCommand(projectMachine.createNew, { reportFailure: false });
  const publishRepository = useAtomCommand(sourceControlMachine.publishRepository, {
    reportFailure: false,
  });
  const discoveryState = useMachineQuery(
    machine === null
      ? null
      : sourceControlMachine.discovery({
          machineId: machine.machineId,
          input: {},
        }),
  );
  const publishTargets = getNewProjectPublishTargets(discoveryState.data);
  const [name, setName] = useState("");
  const [publishes, setPublishes] = useState(false);
  const [publishKind, setPublishKind] = useState<SourceControlProviderKind | null>(null);
  const publishTarget = getNewProjectPublishTarget(publishTargets, publishKind);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedName = name.trim();
  const pathPreview =
    machine?.newProjectsRoot != null
      ? getNewProjectPathPreview(machine.newProjectsRoot, trimmedName)
      : null;

  const showMachines =
    machineOptions.length > 1 || (machine === null && machineOptions.length > 0);
  const machineRows = showMachines ? (
    <ListSection>
      {machineOptions.map((option, index) => {
        const selected = option.machineId === machine?.machineId;
        return (
          <ListRow
            key={option.machineId}
            title={option.label}
            icon={
              <MachineSymbol
                kind={option.machine}
                size={Platform.OS === "android" ? 24 : 17}
                tintColorClassName="accent-icon"
              />
            }
            selected={selected}
            disabled={isSubmitting}
            isFirst={index === 0}
            right={
              selected ? (
                <SymbolView
                  name="checkmark"
                  size={Platform.OS === "android" ? 20 : 14}
                  tintColorClassName="accent-icon"
                  type="monochrome"
                />
              ) : null
            }
            onPress={() => setSelectedMachineId(option.machineId)}
          />
        );
      })}
    </ListSection>
  ) : null;

  // State lags a render behind, so a double tap could start a second create.
  const submittingRef = useRef(false);
  const submit = async () => {
    if (!machine || trimmedName.length === 0 || submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setIsSubmitting(true);
    const result = await createNew({
      machineId: machine.machineId,
      input: { name: trimmedName },
    });
    if (AsyncResult.isFailure(result)) {
      submittingRef.current = false;
      setIsSubmitting(false);
      setError(errorMessage(Cause.squash(result.cause)));
      return;
    }
    const { projectId, workspaceRoot, commitError } = result.value;
    if (commitError !== undefined) {
      Dialog.alert("Created without a first commit", commitError);
    }
    if (publishes && publishTarget !== null) {
      void publishRepository({
        machineId: machine.machineId,
        input: {
          cwd: workspaceRoot,
          provider: publishTarget.definition.kind,
          repository: getNewProjectRepository(publishTarget, workspaceRoot),
          visibility: "private",
        },
      }).then((publishResult) => {
        if (AsyncResult.isFailure(publishResult)) {
          Dialog.alert(
            `Could not create the ${publishTarget.definition.label} repository`,
            errorMessage(Cause.squash(publishResult.cause)),
          );
        }
      });
    }
    // The draft screen resolves its project from the client store, so it
    // must not open before the create event has arrived.
    const project = await waitForProject(
      { machineId: machine.machineId, projectId },
      15_000,
    );
    submittingRef.current = false;
    setIsSubmitting(false);
    if (project === null) {
      setName("");
      setError(
        "The project was created but has not reached this device yet. It will appear in the project list once the connection catches up.",
      );
      return;
    }
    openNewTaskDraft(navigation, {
      machineId: machine.machineId,
      projectId,
      title: trimmedName,
    });
  };

  return (
    <AddProjectShell title="New project">
      {error ? <ErrorBanner message={error} /> : null}
      {machine ? (
        <>
          <TextInput
            className="h-12 min-h-12 rounded-[24px] px-4 py-0 text-base leading-snug"
            value={name}
            onChangeText={setName}
            autoCorrect={false}
            autoFocus
            placeholder="Project name"
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />
          {pathPreview !== null ? (
            <Text className="px-1 text-sm leading-snug text-foreground-muted" numberOfLines={2}>
              {trimmedName.length > 0
                ? `Creates ${pathPreview}`
                : `Goes in ${machine.newProjectsRoot}`}
              {showMachines ? ` on ${machine.label}` : null}
            </Text>
          ) : null}
          {machineRows}
          {publishTarget !== null ? (
            <ListSection>
              <ListRow
                title={`Create private repository on ${publishTarget.definition.label}`}
                subtitle={
                  trimmedName.length > 0 && pathPreview !== null
                    ? getNewProjectRepository(publishTarget, pathPreview)
                    : publishTarget.owner
                }
                icon={
                  <SourceControlIcon
                    kind={publishTarget.definition.icon}
                    size={Platform.OS === "android" ? 24 : 18}
                    colorClassName="accent-icon"
                  />
                }
                isFirst
                right={
                  <ThemedSwitch
                    accessibilityLabel={`Create private repository on ${publishTarget.definition.label}`}
                    value={publishes}
                    onValueChange={setPublishes}
                  />
                }
                onPress={() => setPublishes((current) => !current)}
              />
              {publishes && publishTargets.length > 1
                ? publishTargets.map((target) => {
                    const selected = target.definition.kind === publishTarget.definition.kind;
                    return (
                      <ListRow
                        key={target.definition.kind}
                        title={target.definition.label}
                        icon={
                          <SourceControlIcon
                            kind={target.definition.icon}
                            size={Platform.OS === "android" ? 24 : 17}
                            colorClassName="accent-icon"
                          />
                        }
                        selected={selected}
                        disabled={isSubmitting}
                        right={
                          selected ? (
                            <SymbolView
                              name="checkmark"
                              size={Platform.OS === "android" ? 20 : 14}
                              tintColorClassName="accent-icon"
                              type="monochrome"
                            />
                          ) : null
                        }
                        onPress={() => setPublishKind(target.definition.kind)}
                      />
                    );
                  })
                : null}
            </ListSection>
          ) : null}
          <PrimaryActionButton
            label="Create project"
            disabled={isSubmitting || trimmedName.length === 0}
            onPress={() => void submit()}
            loading={isSubmitting}
          />
          <ListSection>
            <ListRow
              title="Add existing project"
              subtitle="Open a folder or clone a repository"
              icon={
                <SymbolView
                  name="folder.badge.plus"
                  size={Platform.OS === "android" ? 24 : 17}
                  tintColorClassName="accent-icon"
                  type="monochrome"
                />
              }
              isFirst
              onPress={() =>
                navigation.canGoBack()
                  ? navigation.goBack()
                  : navigation.dispatch(StackActions.replace("AddProject"))
              }
            />
          </ListSection>
        </>
      ) : machineOptions.length > 0 ? (
        machineRows
      ) : (
        <EmptyMachineState />
      )}
    </AddProjectShell>
  );
}

export function AddProjectLocalFolderScreen(props: { readonly machineId?: string | string[] }) {
  const machine = useMachineFromParam(props.machineId);
  const canCreateProject = useMachineScope(
    machine?.machineId ?? null,
    AuthOrchestrationOperateScope,
  );
  const createProject = useCreateProject(machine);
  const { isBrowseNavigating, navigateToBrowsePath, pathInput, setPathInput } =
    useBrowsePathInput(machine);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitPath = async () => {
    if (!machine || isBrowseNavigating || isSubmitting) return;
    setError(null);
    const resolved = resolveAddProjectPath({
      rawPath: pathInput,
      currentProjectCwd: null,
      platform: machine.platform,
    });
    if (!resolved.ok) {
      setError(resolved.error);
      return;
    }

    setIsSubmitting(true);
    const result = await createProject(resolved.path);
    if (result && AsyncResult.isFailure(result)) {
      setError(errorMessage(Cause.squash(result.cause)));
    }
    setIsSubmitting(false);
  };

  return (
    <AddProjectShell title="Local folder">
      {error ? <ErrorBanner message={error} /> : null}
      {machine ? (
        <>
          {!canCreateProject ? (
            <ErrorBanner message="This connection cannot add projects." />
          ) : null}
          <ProjectPathInput value={pathInput} onChangeText={setPathInput} onSubmit={submitPath} />
          <PrimaryActionButton
            label="Add project"
            disabled={!canCreateProject || isBrowseNavigating || isSubmitting}
            onPress={submitPath}
            loading={isSubmitting}
          />
          <FolderBrowser
            machine={machine}
            navigateToBrowsePath={navigateToBrowsePath}
            pathInput={pathInput}
            setPathInput={setPathInput}
          />
        </>
      ) : (
        <EmptyMachineState />
      )}
    </AddProjectShell>
  );
}

export function AddProjectDestinationScreen(props: {
  readonly machineId?: string | string[];
  readonly remoteUrl?: string | string[];
  readonly repositoryTitle?: string | string[];
  readonly repositoryName?: string | string[];
  readonly prompt?: string | string[];
}) {
  const cloneRepository = useAtomCommand(sourceControlMachine.cloneRepository, {
    reportFailure: false,
  });
  const startProjectClone = useAtomCommand(sourceControlMachine.startProjectClone, {
    reportFailure: false,
  });
  const navigation = useNavigation();
  const machine = useMachineFromParam(props.machineId);
  const canWriteSourceControl = useMachineScope(
    machine?.machineId ?? null,
    AuthSourceControlWriteScope,
  );
  const canCreateProject = useMachineScope(
    machine?.machineId ?? null,
    AuthOrchestrationOperateScope,
  );
  const canCloneProject = canWriteSourceControl && canCreateProject;
  const createProject = useCreateProject(machine);
  const remoteUrl = stringParam(props.remoteUrl);
  const repositoryTitle = stringParam(props.repositoryTitle);
  const prompt = stringParam(props.prompt);
  const repositoryName = stringParam(props.repositoryName)?.trim() ?? "";
  const { isBrowseNavigating, navigateToBrowsePath, pathInput, setPathInput } = useBrowsePathInput(
    machine,
    repositoryName,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitPath = async () => {
    if (
      !machine ||
      !readMachineScope(machine.machineId, AuthSourceControlWriteScope) ||
      !readMachineScope(machine.machineId, AuthOrchestrationOperateScope) ||
      !remoteUrl ||
      isBrowseNavigating ||
      isSubmitting
    ) {
      return;
    }
    setError(null);
    const resolved = resolveAddProjectPath({
      rawPath: pathInput,
      currentProjectCwd: null,
      platform: machine.platform,
    });
    if (!resolved.ok) {
      setError(resolved.error);
      return;
    }

    setIsSubmitting(true);
    if (machine.supportsCloneTracking) {
      const projectId = ProjectId.make(uuidv4());
      const title = inferProjectTitleFromPath(resolved.path);
      const startResult = await startProjectClone({
        machineId: machine.machineId,
        input: {
          projectId,
          title,
          createdAt: new Date().toISOString(),
          remoteUrl,
          destinationPath: resolved.path,
        },
      });
      if (AsyncResult.isFailure(startResult)) {
        setError(errorMessage(Cause.squash(startResult.cause)));
      } else {
        // The draft screen resolves its project from the client store, so it
        // must not open before the create event has arrived (it would fall back
        // to the project picker and lose the clone controls).
        const project = await waitForProject(
          { machineId: machine.machineId, projectId },
          15_000,
        );
        if (project === null) {
          setError(
            "The project was created but has not reached this device yet. It will appear in the project list once the connection catches up.",
          );
        } else {
          openNewTaskDraft(navigation, {
            machineId: machine.machineId,
            projectId,
            title,
            cloning: "1",
            ...(prompt
              ? await draftWithPrompt(machine.machineId, projectId, prompt).then(
                  (draftId) => ({ draftId }),
                  () => ({}),
                )
              : {}),
          });
        }
      }
      setIsSubmitting(false);
      return;
    }
    const cloneResult = await cloneRepository({
      machineId: machine.machineId,
      input: {
        remoteUrl,
        destinationPath: resolved.path,
      },
    });
    if (AsyncResult.isFailure(cloneResult)) {
      setError(errorMessage(Cause.squash(cloneResult.cause)));
    } else {
      const createResult = await createProject(cloneResult.value.cwd);
      if (createResult && AsyncResult.isFailure(createResult)) {
        setError(errorMessage(Cause.squash(createResult.cause)));
      }
    }
    setIsSubmitting(false);
  };

  return (
    <AddProjectShell title="Clone destination">
      {error ? <ErrorBanner message={error} /> : null}
      {repositoryTitle ? (
        <View className="rounded-[24px] bg-grouped-card px-4 py-3">
          <Text className="text-base font-t3-bold">{repositoryTitle}</Text>
          <Text className="mt-0.5 text-xs text-foreground-muted" numberOfLines={2}>
            {remoteUrl}
          </Text>
        </View>
      ) : null}
      {machine ? (
        <>
          <ProjectPathInput value={pathInput} onChangeText={setPathInput} onSubmit={submitPath} />
          <PrimaryActionButton
            label="Clone project"
            disabled={!canCloneProject || isBrowseNavigating || isSubmitting || !remoteUrl}
            onPress={submitPath}
            loading={isSubmitting}
          />
          {!canCloneProject ? (
            <Text className="text-sm text-foreground-muted">
              This connection cannot clone projects.
            </Text>
          ) : null}
          <FolderBrowser
            machine={machine}
            navigateToBrowsePath={navigateToBrowsePath}
            pathInput={pathInput}
            setPathInput={setPathInput}
            pinnedDirectoryName={repositoryName}
          />
        </>
      ) : (
        <EmptyMachineState />
      )}
    </AddProjectShell>
  );
}
