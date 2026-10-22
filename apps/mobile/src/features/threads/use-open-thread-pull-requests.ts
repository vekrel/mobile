import type { MachineThreadShell } from "@vekrel/client-runtime/state/shell";
import { useNavigation } from "@react-navigation/native";
import { useCallback } from "react";

import * as Dialog from "../../components/ui/Dialog";
import { useNavigateToPullRequest } from "../../native/useOpenPullRequest";
import {
  resolveThreadPrBadgeAction,
  type ThreadPrPresentation,
} from "../../state/thread-pr-presentation";

/** Called once per thread list so virtualized rows share one stable handler. */
export function useOpenThreadPullRequests() {
  const navigation = useNavigation();
  const navigateToPullRequest = useNavigateToPullRequest();
  return useCallback(
    (thread: MachineThreadShell, pr: ThreadPrPresentation) => {
      if (resolveThreadPrBadgeAction(pr).kind === "list") {
        navigation.navigate("ThreadPullRequests", {
          machineId: String(thread.machineId),
          threadId: String(thread.id),
        });
        return;
      }
      void navigateToPullRequest(pr.url, {
        machineId: String(thread.machineId),
        projectId: String(thread.projectId),
      }).then((opened) => {
        if (!opened) Dialog.alert("Unable to open PR", "The pull request could not be opened.");
      });
    },
    [navigation, navigateToPullRequest],
  );
}
