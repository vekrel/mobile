import * as Dialog from "../../components/ui/Dialog";
import { useAtomValue } from "@effect/atom-react";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import {
  AuthProvidersManageScope,
  AuthOrchestrationReadScope,
  type MachineId,
  type ServerProvider,
} from "@vekrel/contracts";
import { settlePromise, squashAtomCommandFailure } from "@vekrel/client-runtime/state/runtime";
import { AsyncResult } from "effect/reactivity";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/ui/AppText";
import { ProviderIcon } from "../../components/ProviderIcon";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { appAtomRegistry } from "../../state/atom-registry";
import { machinePresentations } from "../../state/presentation";
import { serverMachine } from "../../state/server";
import { machineSession, useMachineScope, readMachineScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { useRemoteConnections } from "../../state/use-remote-machine-registry";
import { ConnectionMachineRow } from "../connection/ConnectionMachineRow";
import { MachineRoutesSection } from "./MachineRoutesSection";
import { OutdatedServerUpdateSection } from "./OutdatedServerUpdateSection";
import { SettingsActionRow } from "./components/SettingsActionRow";
import { SettingsScreen } from "./components/SettingsScreen";
import { SettingsSection } from "./components/SettingsSection";
import {
  canMaintainMachine,
  canUpdateMachineProvider,
  findMachineUpdate,
  supportsMachineUpdate,
} from "./machine-maintenance";

export function SettingsMachineDetailRouteScreen({
  route,
}: StaticScreenProps<{
  readonly machineId: MachineId;
}>) {
  // Key local request state to the host even when navigation reuses this screen.
  return (
    <MachineDetail
      key={route.params.machineId}
      machineId={route.params.machineId}
    />
  );
}

function MachineDetail({ machineId }: { readonly machineId: MachineId }) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const connections = useRemoteConnections();
  const machine = connections.connectedMachines.find(
    (entry) => entry.machineId === machineId,
  );
  const config = useAtomValue(serverMachine.configValueAtom(machineId));
  const session = useAtomValue(machineSession.sessionStateValueAtom(machineId));
  const sessionResult = useAtomValue(machineSession.sessionStateAtom(machineId));
  const updateState = useAtomValue(serverMachine.updateStateAtom(machineId));
  const outdated =
    useAtomValue(machinePresentations.presentationAtom(machineId))?.entry
      .serverUpdateRequired === true;
  const updateServer = useAtomCommand(serverMachine.updateServer);
  const updateProvider = useAtomCommand(serverMachine.updateProvider);
  const refreshProviders = useAtomCommand(serverMachine.refreshProviders);
  const [connectionExpanded, setConnectionExpanded] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [release, setRelease] = useState<{
    fromVersion: string;
    targetVersion: string | null;
  } | null>(null);
  const checkController = useRef<AbortController | null>(null);
  useEffect(() => () => checkController.current?.abort(), []);

  const connected = machine?.isEnabled === true && machine.connectionState === "connected";
  const allowed =
    !AsyncResult.isFailure(sessionResult) && canMaintainMachine(session, connected);
  const running = updateState.status === "running";
  const providerBusy =
    config?.providers.some(
      (provider) =>
        provider.updateState?.status === "running" || provider.updateState?.status === "queued",
    ) ?? false;
  const canManageProviders = useMachineScope(machineId, AuthProvidersManageScope);
  const canRead = useMachineScope(machineId, AuthOrchestrationReadScope);
  const busy = !connected || pending !== null || running || providerBusy;
  const disabled = !allowed || busy;
  const version = config?.machine.serverVersion;
  const checkedRelease = release?.fromVersion === version ? release : null;
  const capabilities = config?.machine.capabilities;

  async function run(label: string, action: () => Promise<void>) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(label);
    setError(null);
    setNotice(null);
    const result = await settlePromise(action);
    pendingRef.current = false;
    setPending(null);
    if (AsyncResult.isFailure(result)) {
      const cause = squashAtomCommandFailure(result);
      setError(
        cause instanceof Error ? cause.message : "The action could not be completed. Try again.",
      );
    }
  }

  function requestServerUpdate() {
    const targetVersion = checkedRelease?.targetVersion;
    if (disabled || !targetVersion || !capabilities || !supportsMachineUpdate(capabilities))
      return;
    Dialog.alert(
      `Update ${machine?.machineLabel ?? "machine"}?`,
      `Install Vekrel ${targetVersion}. ${capabilities.serverSelfUpdate === "desktop-managed" ? "The desktop app will close and relaunch." : "The server will restart and reconnect."} Running threads may be interrupted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Update",
          onPress: () =>
            void run("server", async () => {
              if (
                AsyncResult.isFailure(
                  appAtomRegistry.get(machineSession.sessionStateAtom(machineId)),
                ) ||
                !canMaintainMachine(
                  appAtomRegistry.get(machineSession.sessionStateValueAtom(machineId)),
                  connected,
                )
              )
                return;
              const result = await updateServer({
                machineId,
                input: {
                  targetVersion,
                  ...(capabilities.serverUpdateThreadContinuation &&
                  config?.settings.continueThreadsAfterServerUpdate
                    ? { continueRunningThreads: true }
                    : {}),
                },
              });
              if (AsyncResult.isFailure(result)) throw squashAtomCommandFailure(result);
              setRelease(null);
              setNotice(`Updated to ${result.value.targetVersion}.`);
            }),
        },
      ],
    );
  }

  function requestProviderUpdate(provider: ServerProvider) {
    if (
      busy ||
      !readMachineScope(machineId, AuthProvidersManageScope) ||
      !canUpdateMachineProvider(provider)
    )
      return;
    void run(provider.instanceId, async () => {
      const result = await updateProvider({
        machineId,
        input: {
          provider: provider.driver,
          instanceId: provider.instanceId,
        },
      });
      if (AsyncResult.isFailure(result)) throw squashAtomCommandFailure(result);
    });
  }

  return (
    <SettingsScreen title={machine?.machineLabel ?? "Machine"}>
      <ScreenScrollView
        contentInsetAdjustmentBehavior="automatic"
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        {!machine ? (
          <Text className="text-base text-foreground-muted">
            This machine is no longer saved on this device.
          </Text>
        ) : (
          <>
            <SettingsSection title="Connection">
              <ConnectionMachineRow
                machine={machine}
                expanded={connectionExpanded}
                onToggle={() => setConnectionExpanded((value) => !value)}
                onReconnect={connections.onReconnectMachine}
                onRemove={connections.onRemoveMachinePress}
                onSetEnabled={connections.onSetMachineEnabled}
                onUpdate={connections.onUpdateMachine}
              />
            </SettingsSection>
            <MachineRoutesSection
              machineId={machineId}
              connected={connected}
              onAddRoute={() =>
                navigation.navigate("SettingsSheet", {
                  screen: "SettingsContent",
                  params: {
                    screen: "SettingsMachineNew",
                    params: { routeFor: machineId },
                  },
                })
              }
            />
            {outdated ? (
              <OutdatedServerUpdateSection
                machineId={machineId}
                label={machine.machineLabel}
              />
            ) : !connected ? (
              <Text className="px-2 text-sm text-foreground-muted">
                Connect this machine to manage it.
              </Text>
            ) : !allowed ? (
              <Text className="px-2 text-sm text-foreground-muted">
                {AsyncResult.isFailure(sessionResult)
                  ? "Could not verify your permissions. Reconnect to try again."
                  : session === null
                    ? "Checking permissions…"
                    : "This connection does not have permission to manage the machine."}
              </Text>
            ) : null}
            {error ? (
              <Text selectable className="px-2 text-sm text-danger-foreground">
                {error}
              </Text>
            ) : null}
            {notice ? <Text className="px-2 text-sm text-foreground-muted">{notice}</Text> : null}
            {config && !outdated ? (
              <>
                <SettingsSection title="Vekrel">
                  <View className="gap-1 p-4">
                    <Text className="text-base text-foreground">Version {version}</Text>
                    {running ? (
                      <Text className="text-sm text-foreground-muted">
                        {updateState.stage === "resuming"
                          ? "Restarting and reconnecting…"
                          : "Downloading update…"}
                      </Text>
                    ) : updateState.status === "failed" ? (
                      <Text selectable className="text-sm text-danger-foreground">
                        {updateState.message}
                      </Text>
                    ) : null}
                    {checkedRelease ? (
                      <Text className="text-sm text-foreground-muted">
                        {checkedRelease.targetVersion
                          ? `Version ${checkedRelease.targetVersion} is available.`
                          : "You are up to date."}
                      </Text>
                    ) : null}
                    {checkedRelease?.targetVersion &&
                    !supportsMachineUpdate(config.machine.capabilities) ? (
                      <Text className="text-sm text-foreground-muted">
                        {capabilities?.serverSelfUpdate === "desktop-managed"
                          ? "Update the desktop app on this machine."
                          : "Update and restart Vekrel on this machine."}
                      </Text>
                    ) : null}
                  </View>
                  <SettingsActionRow
                    icon="arrow.clockwise"
                    label="Check for updates"
                    disabled={disabled}
                    loading={pending === "check"}
                    onPress={() => {
                      if (disabled) return;
                      void run("check", async () => {
                        const controller = new AbortController();
                        checkController.current = controller;
                        const timeout = setTimeout(() => controller.abort(), 20_000);
                        const fromVersion = config.machine.serverVersion;
                        const result = await settlePromise(() =>
                          findMachineUpdate(fromVersion, controller.signal),
                        );
                        clearTimeout(timeout);
                        checkController.current = null;
                        // `run` owns the error message, so a failed lookup rethrows to it.
                        if (AsyncResult.isFailure(result)) throw squashAtomCommandFailure(result);
                        setRelease({ fromVersion, targetVersion: result.value });
                      });
                    }}
                  />
                  {checkedRelease?.targetVersion &&
                  supportsMachineUpdate(config.machine.capabilities) ? (
                    <SettingsActionRow
                      icon="arrow.up.circle"
                      label={`Update to ${checkedRelease.targetVersion}`}
                      disabled={disabled}
                      loading={pending === "server" || running}
                      onPress={requestServerUpdate}
                    />
                  ) : null}
                </SettingsSection>
                <SettingsSection title="Providers">
                  <SettingsActionRow
                    icon="arrow.clockwise"
                    label="Refresh providers"
                    disabled={busy || !canRead}
                    loading={pending === "refresh"}
                    onPress={() => {
                      if (busy || !canRead) return;
                      void run("refresh", async () => {
                        if (!readMachineScope(machineId, AuthOrchestrationReadScope))
                          return;
                        const result = await refreshProviders({ machineId, input: {} });
                        if (AsyncResult.isFailure(result)) throw squashAtomCommandFailure(result);
                        setNotice("Provider status refreshed.");
                      });
                    }}
                  />
                  {config.providers
                    .filter((provider) => provider.enabled)
                    .map((provider) => (
                      <View key={provider.instanceId}>
                        <View className="gap-1 p-4">
                          <View className="flex-row items-center gap-2">
                            <ProviderIcon provider={provider.driver} size={18} />
                            <Text className="min-w-0 flex-1 text-base font-t3-medium text-foreground">
                              {provider.displayName ?? provider.driver}
                            </Text>
                          </View>
                          <Text className="text-sm text-foreground-muted">
                            {provider.installed
                              ? (provider.version ?? "Version unknown")
                              : "Not installed"}
                            {provider.versionAdvisory?.latestVersion
                              ? ` · Latest ${provider.versionAdvisory.latestVersion}`
                              : ""}
                          </Text>
                          {provider.updateState && provider.updateState.status !== "idle" ? (
                            <Text
                              selectable
                              className={
                                provider.updateState.status === "failed"
                                  ? "text-sm text-danger-foreground"
                                  : "text-sm text-foreground-muted"
                              }
                            >
                              {provider.updateState.message ??
                                `Update ${provider.updateState.status}`}
                            </Text>
                          ) : null}
                          {provider.compatibilityAdvisory?.message ? (
                            <Text selectable className="text-sm text-foreground-muted">
                              {provider.compatibilityAdvisory.message}
                            </Text>
                          ) : null}
                          {provider.unavailableReason || provider.message ? (
                            <Text selectable className="text-sm text-foreground-muted">
                              {provider.unavailableReason ?? provider.message}
                            </Text>
                          ) : null}
                          {provider.versionAdvisory?.status === "behind_latest" &&
                          !provider.versionAdvisory.canUpdate ? (
                            <Text className="text-sm text-foreground-muted">
                              Update this provider on the machine's machine.
                            </Text>
                          ) : null}
                        </View>
                        {canUpdateMachineProvider(provider) ? (
                          <SettingsActionRow
                            icon="arrow.up.circle"
                            label={`Update ${provider.displayName ?? provider.driver}`}
                            disabled={busy || !canManageProviders}
                            loading={pending === provider.instanceId}
                            onPress={() => requestProviderUpdate(provider)}
                          />
                        ) : null}
                      </View>
                    ))}
                </SettingsSection>
              </>
            ) : null}
          </>
        )}
      </ScreenScrollView>
    </SettingsScreen>
  );
}
