import { Toolbar } from "../../components/ui/Toolbar";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";

import { useNavigation } from "@react-navigation/native";
import type { MachineId } from "@vekrel/contracts";
import { useCallback, useState } from "react";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AndroidScreenHeader } from "../../components/ui/AndroidScreenHeader";
import { useRemoteConnections } from "../../state/use-remote-machine-registry";
import { LocalMachineList } from "./LocalMachineList";
import { GitHubRoutingSettings } from "./GitHubRoutingSettings";

export function ConnectionsRouteScreen() {
  const {
    connectedMachines,
    onReconnectMachine,
    onRemoveMachinePress,
    onSetMachineEnabled,
    onUpdateMachine,
  } = useRemoteConnections();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [expandedId, setExpandedId] = useState<MachineId | null>(null);
  const handleToggle = useCallback((machineId: MachineId) => {
    setExpandedId((prev) => (prev === machineId ? null : machineId));
  }, []);

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      {Platform.OS === "android" ? (
        <AndroidScreenHeader
          title="Machines"
          onBack={() => navigation.goBack()}
          actions={[
            {
              accessibilityLabel: "Add machine",
              icon: "plus",
              onPress: () => navigation.navigate("ConnectionsNew"),
            },
          ]}
        />
      ) : (
        <Toolbar placement="right">
          <Toolbar.Button
            icon="plus"
            onPress={() => navigation.navigate("ConnectionsNew")}
            separateBackground
          />
        </Toolbar>
      )}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 18) + 18,
          paddingHorizontal: 20,
          paddingTop: 16,
        }}
      >
        <LocalMachineList
          machines={connectedMachines}
          expandedId={expandedId}
          onToggle={handleToggle}
          onReconnect={onReconnectMachine}
          onRemove={onRemoveMachinePress}
          onSetEnabled={onSetMachineEnabled}
          onUpdate={onUpdateMachine}
        />
        <GitHubRoutingSettings />
      </ScrollView>
    </View>
  );
}
