import * as Dialog from "../../components/ui/Dialog";
import { ConnectionTraceId } from "./ConnectionTraceId";
import { SymbolView } from "../../components/ui/AppSymbol";
import { hasSavedBearerRoute, hostFreezeNotice } from "@vekrel/client-runtime/connection";
import type { AtomCommandResult } from "@vekrel/client-runtime/state/runtime";
import { type MachineId, resolveMachineKind } from "@vekrel/contracts";
import { useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { useCallback, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";

import { AppText as Text } from "../../components/ui/AppText";
import { MachineSymbol } from "../../components/MachineSymbol";
import { Button } from "../../components/ui/Button";
import { IconButton } from "../../components/ui/IconButton";
import { ThemedSwitch } from "../../components/ui/ThemedSwitch";
import { cn } from "../../lib/cn";
import type { ConnectedMachineSummary } from "../../state/remote-runtime-types";
import { serverMachine } from "../../state/server";
import { machinePresentations } from "../../state/presentation";
import { ConnectionDiagnosisDetails, useConnectionDiagnosis } from "./ConnectionDiagnosisDetails";
import { ConnectionFormField } from "./ConnectionFormField";
import { ConnectionStatusDot } from "./ConnectionStatusDot";
import { machineStatusText } from "./machineStatusText";

function connectionStatusLabel(machine: ConnectedMachineSummary): string | null {
  if (!machine.isEnabled && machine.connectionState !== "unsupported") {
    return "Off";
  }
  return machineStatusText({
    phase: machine.connectionState,
    error: machine.connectionError,
    traceId: machine.connectionErrorTraceId,
  });
}

export function ConnectionMachineRow(props: {
  readonly machine: ConnectedMachineSummary;
  readonly expanded: boolean;
  readonly opensDetails?: boolean;
  readonly onToggle: () => void;
  readonly onReconnect: (machineId: MachineId) => void;
  readonly onRemove: (machineId: MachineId) => void;
  readonly onSetEnabled: (machineId: MachineId, enabled: boolean) => void;
  readonly onUpdate: (
    machineId: MachineId,
    updates: { readonly label: string; readonly displayUrl: string },
  ) => Promise<AtomCommandResult<unknown, unknown>>;
}) {
  const [label, setLabel] = useState(props.machine.machineLabel);
  const [url, setUrl] = useState(props.machine.displayUrl);
  const serverConfig = useAtomValue(
    serverMachine.configValueAtom(props.machine.machineId),
  );
  const unsupported = props.machine.connectionState === "unsupported";
  const presentation = useAtomValue(
    machinePresentations.presentationAtom(props.machine.machineId),
  );
  const canRetry = presentation !== null && hasSavedBearerRoute(presentation.entry);
  const { diagnosis, state: connectionState } = useConnectionDiagnosis(
    props.machine.machineId,
    presentation,
  );
  const enabled = props.machine.isEnabled && !unsupported;
  const statusLabel = connectionStatusLabel(props.machine);
  const statusTraceId = enabled ? props.machine.connectionErrorTraceId : null;
  const hasConnectionFailure = enabled && props.machine.connectionError !== null;
  const freeze = enabled
    ? hostFreezeNotice(props.machine.machineLabel, serverConfig?.lastEventLoopStall)
    : null;
  const isRetrying =
    enabled &&
    (props.machine.connectionState === "connecting" ||
      props.machine.connectionState === "reconnecting");
  const handleSave = useCallback(async () => {
    const result = await props.onUpdate(props.machine.machineId, {
      label: label.trim(),
      displayUrl: url.trim(),
    });
    if (AsyncResult.isSuccess(result)) {
      props.onToggle();
      return;
    }
    const error = Cause.squash(result.cause);
    Dialog.alert(
      "Could not update machine",
      error instanceof Error ? error.message : "The machine could not be updated.",
    );
  }, [label, url, props]);

  return (
    <Animated.View layout={LinearTransition.duration(250)} className="bg-grouped-card">
      <View className="flex-row items-center gap-3 px-4 py-3.5">
        <Pressable
          className="min-w-0 flex-1 gap-0.5 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel={
            props.opensDetails
              ? `Manage ${props.machine.machineLabel}`
              : `${props.expanded ? "Collapse" : "Expand"} details for ${props.machine.machineLabel}`
          }
          onPress={props.onToggle}
        >
          <View className="flex-row items-center gap-1.5">
            <ConnectionStatusDot
              state={enabled || unsupported ? props.machine.connectionState : "available"}
              pulse={isRetrying}
              size={8}
            />
            <MachineSymbol
              kind={resolveMachineKind(serverConfig)}
              size={14}
              tintColorClassName="accent-foreground-muted"
            />
            <Text
              className="min-w-0 flex-shrink text-base font-t3-bold leading-snug text-foreground"
              numberOfLines={1}
            >
              {props.machine.machineLabel}
            </Text>
          </View>
          {!props.machine.isRelayManaged && props.machine.displayUrl.trim() ? (
            <Text className="text-xs text-foreground-muted" numberOfLines={1}>
              {props.machine.displayUrl}
            </Text>
          ) : null}
          {diagnosis ? (
            <>
              <Text className="text-xs text-danger-foreground">{diagnosis.headline}</Text>
              {connectionState.attempt > 0 ? (
                <Text className="text-xs text-foreground-muted">
                  {`Retrying · attempt ${connectionState.attempt}`}
                </Text>
              ) : null}
            </>
          ) : statusLabel ? (
            <Text
              className={cn(
                "text-xs",
                hasConnectionFailure ? "text-danger-foreground" : "text-foreground-muted",
              )}
              numberOfLines={props.expanded ? undefined : 1}
              selectable={props.expanded}
            >
              {statusLabel}
              {statusTraceId ? (
                <ConnectionTraceId
                  traceId={statusTraceId}
                  tone={hasConnectionFailure ? "danger" : "muted"}
                  activation="longPress"
                />
              ) : null}
            </Text>
          ) : null}
          {freeze ? (
            <Text
              className="text-xs text-warning-foreground"
              numberOfLines={props.expanded ? undefined : 1}
            >
              {`${freeze.title}. ${freeze.description}`}
            </Text>
          ) : null}
        </Pressable>

        <ThemedSwitch
          accessibilityLabel={`Enable ${props.machine.machineLabel}`}
          style={{ alignSelf: "center" }}
          disabled={unsupported && !canRetry}
          onValueChange={(next) => props.onSetEnabled(props.machine.machineId, next)}
          value={enabled}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            props.opensDetails
              ? `Manage ${props.machine.machineLabel}`
              : `${props.expanded ? "Collapse" : "Expand"} details for ${props.machine.machineLabel}`
          }
          onPress={props.onToggle}
          style={{
            minWidth: 44,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SymbolView
            name={props.opensDetails ? "chevron.right" : "chevron.down"}
            size={12}
            tintColorClassName="accent-icon-subtle"
            type="monochrome"
            style={{ transform: [{ rotate: props.expanded ? "180deg" : "0deg" }] }}
          />
        </Pressable>
      </View>

      {props.expanded ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          className="gap-3 px-4 pb-4"
        >
          {diagnosis ? (
            <ConnectionDiagnosisDetails
              hostLabel={props.machine.machineLabel}
              diagnosis={diagnosis}
            />
          ) : null}
          {props.machine.isRelayManaged ? (
            <Text className="text-sm text-foreground-muted">
              Managed by T3 Connect. Tunnel details update automatically.
            </Text>
          ) : (
            <>
              <ConnectionFormField
                label="Label"
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="My MacBook"
                value={label}
                onChangeText={setLabel}
              />

              <ConnectionFormField
                label="URL"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="192.168.1.100:8080"
                value={url}
                onChangeText={setUrl}
              />
            </>
          )}

          {Platform.OS === "android" ? (
            <View className="flex-row items-center justify-end gap-2">
              {props.machine.isRelayManaged ? null : (
                <View className="flex-1">
                  <Button
                    label="Save"
                    tone="primary"
                    fullWidth
                    onPress={() => {
                      void handleSave();
                    }}
                  />
                </View>
              )}
              <IconButton
                accessibilityLabel="Reconnect machine"
                icon="arrow.clockwise"
                variant="tonal"
                disabled={!enabled}
                onPress={() => props.onReconnect(props.machine.machineId)}
              />
              <IconButton
                accessibilityLabel="Remove machine"
                icon="trash"
                variant="danger"
                onPress={() => props.onRemove(props.machine.machineId)}
              />
            </View>
          ) : (
            <View className="flex-row justify-end gap-2">
              {props.machine.isRelayManaged ? null : (
                <Pressable
                  className="min-h-[42px] flex-1 flex-row items-center justify-center gap-1.5 rounded-[14px] bg-primary px-3.5 py-2.5 active:opacity-70"
                  onPress={handleSave}
                >
                  <SymbolView
                    name="checkmark"
                    size={13}
                    tintColorClassName="accent-primary-foreground"
                    type="monochrome"
                  />
                  <Text className="text-xs font-t3-bold tracking-[0.8px] uppercase text-primary-foreground">
                    Save
                  </Text>
                </Pressable>
              )}

              <Pressable
                className="h-[42px] w-[42px] items-center justify-center rounded-[14px] border border-input-border bg-input active:opacity-70 disabled:opacity-40"
                disabled={!enabled}
                onPress={() => props.onReconnect(props.machine.machineId)}
              >
                <SymbolView
                  name="arrow.clockwise"
                  size={14}
                  tintColorClassName="accent-icon-subtle"
                  type="monochrome"
                />
              </Pressable>

              <Pressable
                className="h-[42px] w-[42px] items-center justify-center rounded-[14px] border border-danger-border bg-danger active:opacity-70"
                onPress={() => props.onRemove(props.machine.machineId)}
              >
                <SymbolView
                  name="trash"
                  size={14}
                  tintColorClassName="accent-danger-foreground"
                  type="monochrome"
                />
              </Pressable>
            </View>
          )}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
