import { Button } from "../../components/ui/Button";
import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { ConnectionTraceId } from "./ConnectionTraceId";
import {
  type MachineConnectionPhase,
  type MachineConnectionPresentation,
} from "@vekrel/client-runtime/connection";
import { SymbolView } from "../../components/ui/AppSymbol";
import { View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";

function noticeTitle(phase: MachineConnectionPhase, machineLabel: string): string {
  switch (phase) {
    case "offline":
      return "You are offline";
    case "connecting":
      return `Connecting to ${machineLabel}...`;
    case "reconnecting":
      return `Reconnecting to ${machineLabel}...`;
    case "unsupported":
      return "Client not supported";
    case "error":
      return `${machineLabel} is unavailable`;
    case "available":
      return `${machineLabel} is disconnected`;
    case "connected":
      return "";
  }
}

function noticeDetail(
  phase: MachineConnectionPhase,
  resourceName: string,
  error: string | null,
): string {
  if (error) {
    return phase === "reconnecting" ? `The app will keep retrying automatically. ${error}` : error;
  }

  switch (phase) {
    case "offline":
      return `Cached data remains available. The ${resourceName} will load when your connection returns.`;
    case "connecting":
    case "reconnecting":
      return `The ${resourceName} will load as soon as the machine is ready.`;
    case "unsupported":
      return "Use compatible versions of the app and server to connect.";
    case "available":
    case "error":
      return `Reconnect the machine to load the ${resourceName}.`;
    case "connected":
      return "";
  }
}

export function MachineConnectionNotice(props: {
  readonly machineLabel: string;
  readonly connection: MachineConnectionPresentation;
  readonly resourceName: string;
  readonly onRetry: () => void;
}) {
  const isRetrying =
    props.connection.phase === "connecting" || props.connection.phase === "reconnecting";

  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="max-w-[320px] items-center gap-3">
        {isRetrying ? (
          <AppActivityIndicator size="small" colorClassName={"accent-icon-muted"} />
        ) : (
          <SymbolView
            name={props.connection.phase === "offline" ? "wifi.slash" : "bolt.horizontal.circle"}
            size={24}
            tintColorClassName={"accent-icon-muted"}
            type="monochrome"
          />
        )}

        <Text className="text-center text-lg font-t3-bold text-foreground">
          {noticeTitle(props.connection.phase, props.machineLabel)}
        </Text>
        <Text className="text-center text-sm leading-normal text-foreground-muted">
          {noticeDetail(props.connection.phase, props.resourceName, props.connection.error)}
          {props.connection.traceId ? (
            <ConnectionTraceId traceId={props.connection.traceId} />
          ) : null}
        </Text>

        {props.connection.phase !== "offline" && props.connection.phase !== "unsupported" ? (
          <View className="mt-1">
            <Button label="Retry now" tone="secondary" onPress={props.onRetry} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
