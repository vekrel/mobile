import * as Dialog from "../../components/ui/Dialog";
import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { type MachineKind, resolveMachineKind } from "@vekrel/contracts";
import { AsyncResult } from "effect/reactivity";
import { useMemo } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import { MACHINE_SYMBOLS } from "../../components/MachineSymbol";
import {
  clearClientCacheAtom,
  clientCacheSummaryAtom,
  type MachineClientCacheSummary,
} from "../../state/client-cache-state";
import { useServerConfigs } from "../../state/entities";
import { useSavedRemoteConnections } from "../../state/use-remote-machine-registry";
import { SettingsActionRow } from "./components/SettingsActionRow";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsScreen } from "./components/SettingsScreen";

export function SettingsClientStorageRouteScreen() {
  const insets = useSafeAreaInsets();
  const summaryResult = useAtomValue(clientCacheSummaryAtom);
  const clearResult = useAtomValue(clearClientCacheAtom);
  const clearCache = useAtomSet(clearClientCacheAtom);
  const { savedConnectionsById } = useSavedRemoteConnections();
  const serverConfigs = useServerConfigs();
  const isClearing = clearResult.waiting;
  const summary = AsyncResult.isSuccess(summaryResult) ? summaryResult.value : null;
  const machineSummaries = useMemo(
    () =>
      [...(summary?.machines ?? [])].sort((left, right) => {
        const leftLabel = savedConnectionsById[left.machineId]?.machineLabel ?? "";
        const rightLabel = savedConnectionsById[right.machineId]?.machineLabel ?? "";
        return leftLabel.localeCompare(rightLabel);
      }),
    [savedConnectionsById, summary?.machines],
  );

  const confirmClearMachine = (machine: MachineClientCacheSummary) => {
    const label =
      savedConnectionsById[machine.machineId]?.machineLabel ??
      machine.machineId;
    Dialog.confirm({
      title: `Clear cache for ${label}?`,
      message:
        "This removes offline threads, server metadata, and cached branches for this machine. The saved connection and credentials stay intact.",
      confirmText: "Clear Cache",
      destructive: true,
      onConfirm: () =>
        clearCache({ type: "machine", machineId: machine.machineId }),
    });
  };

  const confirmClearAll = () => {
    Dialog.confirm({
      title: "Clear all client caches?",
      message:
        "This removes offline data for every machine. Connections, credentials, account data, and app preferences stay intact.",
      confirmText: "Clear All Caches",
      destructive: true,
      onConfirm: () => clearCache({ type: "all" }),
    });
  };

  return (
    <SettingsScreen title="Client Storage">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentInset={{ bottom: Math.max(insets.bottom, 18) }}
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-4 pb-[18px]"
      >
        <SettingsSection title="Machine caches">
          {AsyncResult.isFailure(summaryResult) ? (
            <View className="items-center gap-2 px-6 py-8">
              <SymbolView
                name="exclamationmark.triangle"
                size={28}
                tintColorClassName="accent-danger-foreground"
                type="monochrome"
                weight="regular"
              />
              <Text className="text-center text-base text-foreground">Storage unavailable</Text>
              <Text className="text-center text-sm text-foreground-muted">
                Restart the app and try again.
              </Text>
            </View>
          ) : !summary ? (
            <View className="items-center gap-3 px-6 py-8">
              <AppActivityIndicator />
              <Text className="text-center text-sm text-foreground-muted">
                Inspecting cached data…
              </Text>
            </View>
          ) : machineSummaries.length > 0 ? (
            machineSummaries.map((machine, index) => (
              <CacheMachineRow
                key={machine.machineId}
                machine={machine}
                machineLabel={
                  savedConnectionsById[machine.machineId]?.machineLabel ??
                  machine.machineId
                }
                machineKind={resolveMachineKind(
                  serverConfigs.get(machine.machineId) ?? null,
                )}
                disabled={isClearing}
                first={index === 0}
                onClear={() => confirmClearMachine(machine)}
              />
            ))
          ) : (
            <View className="items-center gap-2 px-6 py-8">
              <SymbolView
                name="checkmark.circle"
                size={28}
                tintColorClassName="accent-icon"
                type="monochrome"
                weight="regular"
              />
              <Text className="text-center text-base text-foreground">No cached data</Text>
              <Text className="text-center text-sm text-foreground-muted">
                Offline cache records will appear here after machines are used.
              </Text>
            </View>
          )}
        </SettingsSection>

        <View className="gap-3">
          <SettingsSection title="Actions">
            <SettingsActionRow
              icon="trash"
              label={summary ? `Clear ${formatBytes(summary.payloadBytes)}` : "Clear caches"}
              tone="danger"
              disabled={isClearing || !summary || summary.recordCount === 0}
              loading={isClearing}
              onPress={confirmClearAll}
            />
          </SettingsSection>
          <Text className="px-2 text-sm leading-normal text-foreground-muted">
            Clearing caches never removes machine connections, credentials, account data, or
            appearance preferences.
          </Text>
          {AsyncResult.isFailure(summaryResult) || AsyncResult.isFailure(clearResult) ? (
            <Text selectable className="px-2 text-sm text-danger-foreground">
              Client storage is temporarily unavailable. Try again after restarting the app.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SettingsScreen>
  );
}

function CacheMachineRow(props: {
  readonly machine: MachineClientCacheSummary;
  readonly machineLabel: string;
  readonly machineKind: MachineKind;
  readonly disabled: boolean;
  readonly first: boolean;
  readonly onClear: () => void;
}) {
  return (
    <View className={props.first ? undefined : "border-t border-border"}>
      <SettingsActionRow
        icon={MACHINE_SYMBOLS[props.machineKind]}
        label={props.machineLabel}
        description={`Clear ${formatBytes(props.machine.payloadBytes)} of cached data`}
        tone="danger"
        disabled={props.disabled}
        onPress={props.onClear}
      />
    </View>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
