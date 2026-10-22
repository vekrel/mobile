import type { MachineId } from "@vekrel/contracts";
import { useCallback } from "react";
import { View } from "react-native";

import { EmptyState } from "../../components/ui/EmptyState";
import { machineCatalog } from "../../connection/catalog";
import type { AssetUrlFailureReason } from "../../state/asset-url-state";
import { useAtomCommand } from "../../state/use-atom-command";
import { useMachinePresentation } from "../../state/presentation";
import { MachineConnectionNotice } from "../connection/MachineConnectionNotice";

export function WorkspaceFilePreviewError(props: {
  readonly machineId: MachineId | null;
  readonly reason: AssetUrlFailureReason;
  readonly onRetry: () => void;
}) {
  const { machineId, onRetry } = props;
  const machine = useMachinePresentation(machineId);
  const retryMachine = useAtomCommand(machineCatalog.retryNow, "machine retry");
  const retryConnection = useCallback(() => {
    if (machineId !== null) void retryMachine(machineId);
    onRetry();
  }, [machineId, onRetry, retryMachine]);

  if (props.reason === "disconnected") {
    return (
      <View className="flex-1 bg-sheet">
        <MachineConnectionNotice
          machineLabel={machine.presentation?.entry.target.label ?? "Machine"}
          connection={
            machine.presentation?.connection ?? {
              phase: "available",
              error: null,
              traceId: null,
            }
          }
          resourceName="preview"
          onRetry={retryConnection}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-sheet px-6">
      <EmptyState
        title="Preview unavailable"
        detail="This file may be missing, unsupported, or unavailable on this machine."
        actionLabel="Try again"
        onAction={props.onRetry}
      />
    </View>
  );
}
