import { Pressable } from "react-native";
import type { MachineKind } from "@vekrel/contracts";
import type { MachineConnectionPhase } from "@vekrel/client-runtime/connection";
import { MachineSymbol } from "../../components/MachineSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";

import { ConnectionStatusDot } from "../connection/ConnectionStatusDot";

export function DraftMachineControl(props: {
  readonly label: string;
  readonly connectionState: MachineConnectionPhase;
  readonly machineKind: MachineKind;
  readonly disabled: boolean;
  readonly onChooseMachine: () => void;
}) {
  const disconnected = props.connectionState !== "connected";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Choose machine, ${props.label}, ${disconnected ? "Offline" : "Connected"}`}
      disabled={props.disabled}
      onPress={props.onChooseMachine}
      className="flex-row items-center gap-1.5 rounded-xl px-3 py-2 active:opacity-65"
    >
      <MachineSymbol
        kind={props.machineKind}
        size={13}
        tintColorClassName="accent-icon-muted"
      />
      <Text className="shrink text-sm text-foreground-muted" numberOfLines={1}>
        on {props.label}
      </Text>
      <SymbolView name="chevron.right" size={11} tintColorClassName="accent-icon-muted" />
      {disconnected ? <ConnectionStatusDot state="error" pulse={false} size={6} /> : null}
    </Pressable>
  );
}
