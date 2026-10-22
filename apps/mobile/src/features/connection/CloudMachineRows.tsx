import { Button } from "../../components/ui/Button";
import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { ConnectionTraceId } from "./ConnectionTraceId";
import { useAuth } from "@clerk/expo";
import { SymbolView } from "../../components/ui/AppSymbol";
import {
  hasSavedBearerRoute,
  type MachineConnectionPhase,
} from "@vekrel/client-runtime/connection";
import {
  type MachineId,
  type MachineKind,
  type ExecutionMachineDescriptor,
  resolveMachineKind,
} from "@vekrel/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useCallback, useState } from "react";
import { Pressable, type TextLayoutEvent, View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { MachineSymbol } from "../../components/MachineSymbol";
import { ThemedSwitch } from "../../components/ui/ThemedSwitch";
import { cn } from "../../lib/cn";
import { copyTextWithHaptic } from "../../lib/copyTextWithHaptic";
import type { ConnectedMachineSummary } from "../../state/remote-runtime-types";
import { serverMachine } from "../../state/server";
import { machinePresentations } from "../../state/presentation";
import { availableCloudMachinePresentation } from "../cloud/cloudMachinePresentation";
import { hasCloudPublicConfig } from "../cloud/publicConfig";
import { ConnectionStatusDot } from "./ConnectionStatusDot";
import { useConnectionDiagnosis } from "./ConnectionDiagnosisDetails";
import { machineStatusText } from "./machineStatusText";
import { type RelayMachineView, useConnectionController } from "./useConnectionController";

interface CloudMachineRowsProps {
  readonly connectedCloudMachines: ReadonlyArray<ConnectedMachineSummary>;
  readonly onOpenMachine?: (machineId: MachineId) => void;
  readonly onSetMachineEnabled: (machineId: MachineId, enabled: boolean) => void;
  readonly onRemoveMachine: (machineId: MachineId) => void;
  readonly showcaseAvailableMachines?: ReadonlyArray<RelayMachineView>;
  readonly showcaseSignedIn?: boolean;
  readonly showHeader?: boolean;
}

export function CloudMachineRows(props: CloudMachineRowsProps) {
  // Showcase captures run without a Clerk publishable key, so `ClerkProvider`
  // is never mounted and any `useAuth` call throws — the fixture states whether
  // the rows are signed in instead of asking Clerk.
  if (props.showcaseSignedIn !== undefined) {
    return props.showcaseSignedIn ? <CloudMachineRowsContent {...props} /> : null;
  }
  // No cloud config means no `ClerkProvider` either, so `useAuth` would throw.
  if (!hasCloudPublicConfig()) {
    return <ConnectedOnlyCloudMachineRows {...props} />;
  }
  return <SignedInCloudMachineRows {...props} />;
}

function SignedInCloudMachineRows(props: CloudMachineRowsProps) {
  const { isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  if (!isSignedIn) return <ConnectedOnlyCloudMachineRows {...props} />;
  return <CloudMachineRowsContent {...props} />;
}

function ConnectedOnlyCloudMachineRows(props: CloudMachineRowsProps) {
  if (props.connectedCloudMachines.length === 0) return null;
  return <CloudMachineRowsContent {...props} discoveryAvailable={false} />;
}

function CloudMachineRowsContent(
  props: CloudMachineRowsProps & { readonly discoveryAvailable?: boolean },
) {
  const controller = useConnectionController();
  const discoveryAvailable = props.discoveryAvailable ?? true;
  const availableCloudMachines = discoveryAvailable
    ? (props.showcaseAvailableMachines ?? controller.availableRelayMachines)
    : [];
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
  const hasCloudRows =
    props.connectedCloudMachines.length > 0 || availableCloudMachines.length > 0;

  const handleConnectCloudMachine = useCallback(
    (entry: RelayMachineView) => controller.connectRelayMachine(entry.machine),
    [controller],
  );

  const discoveredDescriptors = new Map(
    controller.relayMachines.flatMap((entry) =>
      entry.status?.descriptor === undefined
        ? []
        : [[entry.machine.machineId, entry.status.descriptor] as const],
    ),
  );

  const handleToggleCloudError = useCallback((machineId: string) => {
    setExpandedErrorId((current) => (current === machineId ? null : machineId));
  }, []);

  const showHeader = props.showHeader ?? true;

  return (
    <View collapsable={false} className={cn("gap-3", showHeader && "mt-5")}>
      {showHeader ? (
        <View className="px-1">
          <Text className="text-sm font-t3-bold uppercase text-foreground-muted">Vekrel Connect</Text>
        </View>
      ) : null}

      {hasCloudRows ? (
        <View collapsable={false} className="overflow-hidden rounded-[24px] bg-grouped-card">
          {props.connectedCloudMachines.map((machine) => (
            <ConnectedCloudMachineRow
              key={machine.machineId}
              machine={machine}
              descriptor={discoveredDescriptors.get(machine.machineId)}
              onSetEnabled={(enabled) =>
                props.onSetMachineEnabled(machine.machineId, enabled)
              }
              onRemove={() => props.onRemoveMachine(machine.machineId)}
              onOpen={
                props.onOpenMachine
                  ? () => props.onOpenMachine?.(machine.machineId)
                  : undefined
              }
              errorExpanded={expandedErrorId === machine.machineId}
              onToggleError={() => handleToggleCloudError(machine.machineId)}
            />
          ))}
          {availableCloudMachines.map((machine) => (
            <CloudMachineRow
              key={machine.machine.machineId}
              machine={machine}
              showChevron={props.onOpenMachine !== undefined}
              onConnect={() => handleConnectCloudMachine(machine)}
              errorExpanded={expandedErrorId === machine.machine.machineId}
              onToggleError={() => handleToggleCloudError(machine.machine.machineId)}
            />
          ))}
        </View>
      ) : controller.relayDiscovery.isRefreshing ? (
        <View collapsable={false} className="items-center gap-3 rounded-[24px] bg-grouped-card p-6">
          <AppActivityIndicator colorClassName={"accent-icon"} />
          <Text className="text-center text-sm leading-normal text-foreground-muted">
            Loading linked cloud machines.
          </Text>
        </View>
      ) : controller.relayDiscovery.error ? null : (
        <View collapsable={false} className="rounded-[24px] bg-grouped-card p-5">
          <Text className="text-sm leading-normal text-foreground-muted">
            No additional linked cloud machines.
          </Text>
        </View>
      )}

      {discoveryAvailable &&
      controller.relayDiscovery.error &&
      !controller.relayDiscovery.isRefreshing ? (
        <View collapsable={false} className="gap-3 rounded-[24px] bg-grouped-card p-5">
          <Text className="text-base font-t3-bold text-foreground">
            Could not load Vekrel Connect machines
          </Text>
          <Text className="text-sm text-foreground-muted">{controller.relayDiscovery.error}</Text>
          {controller.relayDiscovery.errorTraceId ? (
            <CopyTraceIdButton traceId={controller.relayDiscovery.errorTraceId} />
          ) : null}
          <Button
            label="Try again"
            tone="secondary"
            onPress={() => {
              void controller.refreshRelayMachines();
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

function ConnectedCloudMachineRow(props: {
  readonly machine: ConnectedMachineSummary;
  readonly descriptor: ExecutionMachineDescriptor | undefined;
  readonly errorExpanded: boolean;
  readonly onSetEnabled: (enabled: boolean) => void;
  readonly onRemove: () => void;
  readonly onOpen?: (() => void) | undefined;
  readonly onToggleError: () => void;
}) {
  const serverConfig = useAtomValue(
    serverMachine.configValueAtom(props.machine.machineId),
  );
  const unsupported = props.machine.connectionState === "unsupported";
  const presentation = useAtomValue(
    machinePresentations.presentationAtom(props.machine.machineId),
  );
  const canRetry = presentation !== null && hasSavedBearerRoute(presentation.entry);
  const enabled = props.machine.isEnabled && !unsupported;
  const { diagnosis } = useConnectionDiagnosis(props.machine.machineId, presentation);
  const [lastDescriptor, setLastDescriptor] = useState(props.descriptor);
  if (props.descriptor !== undefined && props.descriptor !== lastDescriptor) {
    setLastDescriptor(props.descriptor);
  }
  return (
    <CloudMachineRowShell
      opensDetails={props.onOpen !== undefined}
      onOpen={props.onOpen}
      onRemove={props.onRemove}
      connectionError={enabled || unsupported ? props.machine.connectionError : null}
      connectionErrorTraceId={enabled ? props.machine.connectionErrorTraceId : null}
      connectionState={enabled || unsupported ? props.machine.connectionState : "available"}
      errorExpanded={props.errorExpanded}
      label={props.machine.machineLabel}
      machine={resolveMachineKind(
        serverConfig ?? (lastDescriptor === undefined ? null : { machine: lastDescriptor }),
      )}
      onValueChange={props.onSetEnabled}
      onToggleError={props.onToggleError}
      disabled={unsupported && !canRetry}
      {...(enabled || unsupported
        ? diagnosis
          ? { statusText: diagnosis.headline }
          : {}
        : { statusText: "Off" })}
      value={enabled}
    />
  );
}

function CloudMachineRow(props: {
  readonly machine: RelayMachineView;
  readonly showChevron: boolean;
  readonly errorExpanded: boolean;
  readonly onConnect: () => void;
  readonly onToggleError: () => void;
}) {
  const presentation = availableCloudMachinePresentation({
    isStatusPending: props.machine.availability === "checking",
    status: props.machine.status,
    statusError: props.machine.error,
    statusErrorTraceId: props.machine.traceId,
  });

  return (
    <CloudMachineRowShell
      showChevron={props.showChevron}
      connectionError={presentation.connectionError}
      connectionErrorTraceId={presentation.connectionErrorTraceId}
      connectionState={presentation.connectionState}
      errorExpanded={props.errorExpanded}
      label={props.machine.machine.label}
      machine={resolveMachineKind(
        props.machine.status?.descriptor === undefined
          ? null
          : { machine: props.machine.status.descriptor },
      )}
      onValueChange={(enabled) => {
        if (enabled) {
          props.onConnect();
        }
      }}
      onToggleError={props.onToggleError}
      disabled={presentation.connectionState === "unsupported"}
      statusText={presentation.statusText}
      value={false}
    />
  );
}

function CloudMachineRowShell(props: {
  readonly showChevron?: boolean;
  readonly opensDetails?: boolean;
  readonly onOpen?: (() => void) | undefined;
  readonly onRemove?: (() => void) | undefined;
  readonly connectionError: string | null;
  readonly connectionErrorTraceId: string | null;
  readonly connectionState: MachineConnectionPhase;
  readonly disabled?: boolean;
  readonly errorExpanded: boolean;
  readonly label: string;
  readonly machine: MachineKind;
  readonly onToggleError: () => void;
  readonly onValueChange: (enabled: boolean) => void;
  readonly statusText?: string;
  readonly value: boolean;
}) {
  const isRetrying =
    props.connectionState === "connecting" || props.connectionState === "reconnecting";
  const shouldPulse = isRetrying;
  const statusText =
    props.statusText ??
    machineStatusText({
      phase: props.connectionState,
      error: props.connectionError,
      traceId: props.connectionErrorTraceId,
    });
  const statusClassName =
    props.connectionError && props.connectionState !== "unsupported"
      ? "text-danger-foreground"
      : "text-foreground-muted";
  const [errorMeasurement, setErrorMeasurement] = useState<{
    readonly text: string;
    readonly lineCount: number;
  } | null>(null);
  const errorTraceId = props.connectionErrorTraceId;
  const measuredErrorText = errorTraceId ? `${statusText} Trace ID: ${errorTraceId}` : statusText;
  const errorLineCount =
    errorMeasurement?.text === measuredErrorText ? errorMeasurement.lineCount : 0;
  const errorCanExpand = props.connectionError !== null && errorLineCount > 1;
  const isErrorExpanded = errorCanExpand && props.errorExpanded;
  const StatusContainer = errorCanExpand ? Pressable : View;
  const ContentContainer = props.onOpen || props.onRemove ? Pressable : View;
  const ChevronContainer = props.onOpen || props.onRemove ? Pressable : View;
  const onMeasuredErrorTextLayout = useCallback(
    (event: TextLayoutEvent) => {
      if (!props.connectionError) {
        return;
      }
      const nextLineCount = event.nativeEvent.lines.length;
      setErrorMeasurement((currentMeasurement) =>
        currentMeasurement?.text === measuredErrorText &&
        currentMeasurement.lineCount === nextLineCount
          ? currentMeasurement
          : { text: measuredErrorText, lineCount: nextLineCount },
      );
    },
    [measuredErrorText, props.connectionError],
  );
  return (
    <View collapsable={false} className="flex-row items-center gap-3 bg-grouped-card px-4 py-3.5">
      <ContentContainer
        className="min-w-0 flex-1 gap-0.5"
        accessibilityHint={props.onRemove ? "Long press to remove from this device" : undefined}
        accessibilityRole={props.onOpen ? "button" : undefined}
        accessibilityLabel={
          props.onOpen
            ? `Manage ${props.label}`
            : props.onRemove
              ? `Remove ${props.label} from this device`
              : undefined
        }
        onPress={props.onOpen}
        onLongPress={props.onRemove}
      >
        <View className="min-w-0 flex-row items-center gap-2">
          <ConnectionStatusDot state={props.connectionState} pulse={shouldPulse} size={7} />
          <MachineSymbol
            kind={props.machine}
            size={14}
            tintColorClassName="accent-foreground-muted"
          />
          <Text
            className="min-w-0 flex-shrink text-base font-t3-bold leading-snug text-foreground"
            numberOfLines={1}
          >
            {props.label}
          </Text>
        </View>
        {props.connectionError ? (
          <Text
            aria-hidden
            onTextLayout={onMeasuredErrorTextLayout}
            className={cn("absolute inset-x-0 -z-[1] text-xs opacity-0", statusClassName)}
          >
            {measuredErrorText}
          </Text>
        ) : null}
        <StatusContainer
          {...(errorCanExpand
            ? { accessibilityRole: "button" as const, onPress: props.onToggleError }
            : {})}
          className="min-w-0 flex-row items-start gap-1"
        >
          <Text
            className={cn("min-w-0 flex-1 text-xs", statusClassName)}
            numberOfLines={isErrorExpanded ? undefined : 1}
          >
            {statusText}
            {errorTraceId ? (
              <ConnectionTraceId
                traceId={errorTraceId}
                tone={
                  props.connectionError && props.connectionState !== "unsupported"
                    ? "danger"
                    : "muted"
                }
                activation="longPress"
              />
            ) : null}
          </Text>
          {errorCanExpand ? (
            <SymbolView
              name="chevron.down"
              size={10}
              tintColorClassName={"accent-chevron"}
              type="monochrome"
              style={{
                marginTop: 3,
                transform: [{ rotate: isErrorExpanded ? "180deg" : "0deg" }],
              }}
            />
          ) : null}
        </StatusContainer>
      </ContentContainer>
      <ThemedSwitch
        accessibilityLabel={`Enable ${props.label}`}
        style={{ alignSelf: "center" }}
        disabled={props.disabled}
        onValueChange={props.onValueChange}
        value={props.value}
      />
      {props.opensDetails || props.showChevron ? (
        <ChevronContainer
          accessibilityRole={props.onOpen ? "button" : undefined}
          accessibilityLabel={
            props.onOpen
              ? `Manage ${props.label}`
              : props.onRemove
                ? `Remove ${props.label} from this device`
                : undefined
          }
          accessibilityHint={props.onRemove ? "Long press to remove from this device" : undefined}
          onPress={props.onOpen}
          onLongPress={props.onRemove}
          style={{
            opacity: props.opensDetails ? 1 : 0.4,
            minWidth: 44,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SymbolView name="chevron.right" size={12} tintColorClassName="accent-icon-subtle" />
        </ChevronContainer>
      ) : null}
    </View>
  );
}

function CopyTraceIdButton(props: { readonly traceId: string }) {
  return (
    <Button
      label="Copy trace ID"
      tone="secondary"
      onPress={() => {
        copyTextWithHaptic(props.traceId, { target: "connection-trace-id" });
      }}
      icon="doc.on.doc"
    />
  );
}
