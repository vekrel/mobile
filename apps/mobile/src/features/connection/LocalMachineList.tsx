import type { MachineId } from "@vekrel/contracts";
import type { ComponentProps } from "react";
import { View } from "react-native";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { ConnectionMachineRow } from "./ConnectionMachineRow";

type MachineRowProps = ComponentProps<typeof ConnectionMachineRow>;

export function LocalMachineList({
  machines,
  expandedId,
  onToggle,
  ...rowActions
}: Pick<
  MachineRowProps,
  "onReconnect" | "onRemove" | "onSetEnabled" | "onUpdate" | "opensDetails"
> & {
  readonly machines: ReadonlyArray<MachineRowProps["machine"]>;
  readonly expandedId: MachineId | null;
  readonly onToggle: (machineId: MachineId) => void;
}) {
  if (machines.length === 0) {
    return (
      <View
        collapsable={false}
        className="items-center gap-3 rounded-[24px] bg-grouped-card px-6 py-8"
      >
        <View className="h-12 w-12 items-center justify-center rounded-[16px] bg-subtle">
          <SymbolView
            name="point.3.connected.trianglepath.dotted"
            size={20}
            tintColorClassName="accent-icon-muted"
            type="monochrome"
          />
        </View>
        <Text className="text-center text-sm leading-normal text-foreground-muted">
          No machines connected yet.{"\n"}Tap{" "}
          <Text className="font-t3-bold text-foreground">+</Text> to add one.
        </Text>
      </View>
    );
  }

  return (
    <View collapsable={false} className="overflow-hidden rounded-[24px] bg-grouped-card">
      {machines.map((machine) => (
        <View key={machine.machineId} collapsable={false}>
          <ConnectionMachineRow
            machine={machine}
            expanded={expandedId === machine.machineId}
            onToggle={() => onToggle(machine.machineId)}
            {...rowActions}
          />
        </View>
      ))}
    </View>
  );
}
