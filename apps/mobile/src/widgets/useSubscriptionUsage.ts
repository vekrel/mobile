import { useAtomValue } from "@effect/atom-react";
import { useEffect, useMemo } from "react";
import { AppState } from "react-native";

import { machinePresentations } from "../state/presentation";
import { serverMachine } from "../state/server";
import { useAtomCommand } from "../state/use-atom-command";
import { createWidgetRefresher, WIDGET_REFRESH_INTERVAL } from "./subscriptionUsageSnapshot";

export function useSubscriptionUsage(enabled = true) {
  const presentations = useAtomValue(machinePresentations.presentationsAtom);
  const refreshProviders = useAtomCommand(serverMachine.refreshProviders, {
    reportFailure: false,
  });
  const refresh = useMemo(
    () =>
      createWidgetRefresher(
        (machineId: Parameters<typeof refreshProviders>[0]["machineId"]) =>
          refreshProviders({ machineId, input: {} }),
      ),
    [refreshProviders],
  );

  useEffect(() => {
    const update = () => {
      if (!enabled || AppState.currentState !== "active") return;
      const connected = [...presentations]
        .filter(([, presentation]) => presentation.connection.phase === "connected")
        .map(([id]) => id);
      void refresh(connected, Date.now());
    };
    update();
    const subscription = AppState.addEventListener("change", update);
    const timer = setInterval(update, WIDGET_REFRESH_INTERVAL);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [enabled, presentations, refresh]);
}
