import { useAtomValue } from "@effect/atom-react";
import type { MachineId } from "@vekrel/contracts";
import { CHATGPT_USAGE_URL, collectExternalUsageLinks } from "@vekrel/shared/usageLimits";
import { Linking, Pressable, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { ProviderIcon } from "../../components/ProviderIcon";
import { machinePresentations } from "../../state/presentation";

export function ChatGptUsageSummary({
  selectedMachineIds,
}: {
  selectedMachineIds: ReadonlySet<MachineId> | null;
}) {
  const presentations = useAtomValue(machinePresentations.presentationsWithProvidersAtom);
  const selected =
    selectedMachineIds === null
      ? presentations
      : new Map([...presentations].filter(([id]) => selectedMachineIds.has(id)));
  const usage = collectExternalUsageLinks(selected).find((link) => link.url === CHATGPT_USAGE_URL);
  if (!usage) return null;
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-2">
          <ProviderIcon provider="codex" size={16} />
          <Text className="text-sm text-foreground">ChatGPT shared usage</Text>
        </View>
        <Pressable
          accessibilityRole="link"
          className="min-h-11 justify-center"
          onPress={() => void Linking.openURL(usage.url).catch(() => undefined)}
        >
          <Text className="text-sm font-t3-medium text-primary">Manage usage</Text>
        </Pressable>
      </View>
      <Text className="text-xs text-foreground-muted">
        {usage.accounts.join(", ")}. Open ChatGPT with the account you connected.
      </Text>
    </View>
  );
}
