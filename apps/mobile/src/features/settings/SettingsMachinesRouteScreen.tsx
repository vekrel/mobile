import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { useNavigation } from "@react-navigation/native";
import { useAtomValue } from "@effect/atom-react";
import { managedRelaySessionAtom } from "@vekrel/client-runtime/relay";
import type { MachineId } from "@vekrel/contracts";
import { useRef, useState } from "react";
import { Platform, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SettingsScreen } from "./components/SettingsScreen";
import { AndroidAnchoredMenu } from "../../components/ui/AndroidAnchoredMenu";
import { AndroidHeaderIconButton } from "../../components/ui/AndroidScreenHeader";
import { CloudMachineRows } from "../connection/CloudMachineRows";
import { LocalMachineList } from "../connection/LocalMachineList";
import { GitHubRoutingSettings } from "../connection/GitHubRoutingSettings";
import { splitMachineSections } from "../connection/machineSections";
import { useUniwindTheme } from "../../lib/useUniwindTheme";
import { useRemoteConnections } from "../../state/use-remote-machine-registry";
import { relayMachineDiscovery } from "../../state/relay";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  applyShowcaseLocalMachineDisplayUrls,
  resolveShowcaseMachineUpdateDisplayUrl,
  SHOWCASE_AVAILABLE_CLOUD_MACHINES,
  SHOWCASE_CONNECTED_CLOUD_MACHINES,
} from "../showcase/showcaseMachineRows";

const SHOWCASE_ENABLED = process.env.EXPO_PUBLIC_SHOWCASE === "1";

export function SettingsMachinesRouteScreen() {
  const {
    connectedMachines,
    onReconnectMachine,
    onRemoveMachinePress,
    onSetMachineEnabled,
    onUpdateMachine,
  } = useRemoteConnections();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const machineSections = splitMachineSections({
    connectedMachines,
    cloudMachines: null,
  });
  const localMachines = SHOWCASE_ENABLED
    ? applyShowcaseLocalMachineDisplayUrls(machineSections.localMachines)
    : machineSections.localMachines;
  const connectedCloudMachines = SHOWCASE_ENABLED
    ? SHOWCASE_CONNECTED_CLOUD_MACHINES
    : machineSections.connectedCloudMachines;
  const headerIconColor = useUniwindTheme()["--color-icon"];
  const relaySession = useAtomValue(managedRelaySessionAtom);
  const refreshRelayMachines = useAtomCommand(
    relayMachineDiscovery.refresh,
    "relay machine refresh",
  );
  const [isRefreshingCloud, setIsRefreshingCloud] = useState(false);
  const cloudRefreshPendingRef = useRef(false);
  async function refreshCloudMachines() {
    if (!relaySession || cloudRefreshPendingRef.current) return;
    cloudRefreshPendingRef.current = true;
    setIsRefreshingCloud(true);
    await refreshRelayMachines();
    cloudRefreshPendingRef.current = false;
    setIsRefreshingCloud(false);
  }

  const openMachine = (machineId: MachineId) => {
    navigation.navigate("SettingsSheet", {
      screen: "SettingsContent",
      params: { screen: "SettingsMachineDetail", params: { machineId } },
    });
  };
  const handleUpdateMachine = (
    machineId: MachineId,
    updates: { readonly label: string; readonly displayUrl: string },
  ) => {
    if (!SHOWCASE_ENABLED) return onUpdateMachine(machineId, updates);
    const actualMachine = machineSections.localMachines.find(
      (machine) => machine.machineId === machineId,
    );
    const presentedMachine = localMachines.find(
      (machine) => machine.machineId === machineId,
    );
    return onUpdateMachine(machineId, {
      ...updates,
      displayUrl:
        actualMachine && presentedMachine
          ? resolveShowcaseMachineUpdateDisplayUrl({
              actualDisplayUrl: actualMachine.displayUrl,
              presentedDisplayUrl: presentedMachine.displayUrl,
              submittedDisplayUrl: updates.displayUrl,
            })
          : updates.displayUrl,
    });
  };

  return (
    <SettingsScreen
      title="Machines"
      trailing={
        Platform.OS === "android" && relaySession ? (
          <AndroidAnchoredMenu
            title="Machine options"
            actions={[
              {
                id: "refresh",
                title: "Refresh cloud machines",
                attributes: { disabled: isRefreshingCloud },
              },
            ]}
            onPressAction={({ nativeEvent }) => {
              if (nativeEvent.event === "refresh") void refreshCloudMachines();
            }}
          >
            {(open) => (
              <AndroidHeaderIconButton
                accessibilityLabel="Machine options"
                icon="ellipsis"
                onPress={open}
              />
            )}
          </AndroidAnchoredMenu>
        ) : undefined
      }
      actions={[
        {
          accessibilityLabel: "Add machine",
          icon: "plus",
          tintColor: headerIconColor,
          onPress: () =>
            navigation.navigate("SettingsSheet", {
              screen: "SettingsContent",
              params: { screen: "SettingsMachineNew" },
            }),
        },
      ]}
    >
      <ScrollView
        alwaysBounceVertical
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="px-5 pt-4"
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 18) + 18,
        }}
        refreshControl={
          relaySession ? (
            <RefreshControl
              refreshing={isRefreshingCloud}
              onRefresh={() => void refreshCloudMachines()}
            />
          ) : undefined
        }
      >
        <LocalMachineList
          machines={localMachines}
          expandedId={null}
          onToggle={openMachine}
          opensDetails
          onReconnect={onReconnectMachine}
          onRemove={onRemoveMachinePress}
          onSetEnabled={onSetMachineEnabled}
          onUpdate={handleUpdateMachine}
        />

        {/* Always mounted: already-connected relay machines must stay
            visible (and removable) even when cloud config is missing or the
            user is signed out — the component gates discovery itself. */}
        <CloudMachineRows
          connectedCloudMachines={connectedCloudMachines}
          onOpenMachine={openMachine}
          onSetMachineEnabled={onSetMachineEnabled}
          onRemoveMachine={onRemoveMachinePress}
          {...(SHOWCASE_ENABLED
            ? {
                showcaseAvailableMachines: SHOWCASE_AVAILABLE_CLOUD_MACHINES,
                showcaseSignedIn: true,
              }
            : {})}
        />
        <GitHubRoutingSettings />
      </ScrollView>
    </SettingsScreen>
  );
}
