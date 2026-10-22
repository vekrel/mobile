import { useAtomValue } from "@effect/atom-react";
import type { PullRequestDetail } from "@vekrel/contracts";
import { usePullRequestConnected } from "./usePullRequestConnected";
import { composerPullRequests } from "../../state/pull-requests";
import { pullRequestTarget, type PullRequestParams } from "./usePullRequestDiff";

export function usePullRequestPermissions(params: PullRequestParams, pr: PullRequestDetail | null) {
  const { machineId } = pullRequestTarget(params);
  const connected = usePullRequestConnected(machineId);
  const canWrite = useAtomValue(composerPullRequests.runAction.permissionAtom(machineId));
  const canComment = useAtomValue(composerPullRequests.comment.permissionAtom(machineId));
  const canReview = useAtomValue(composerPullRequests.submitReview.permissionAtom(machineId));
  const canReply = useAtomValue(composerPullRequests.replyToThread.permissionAtom(machineId));
  const canResolve = useAtomValue(
    composerPullRequests.setThreadResolution.permissionAtom(machineId),
  );
  return {
    connected,
    canInlineComment:
      connected &&
      canReview &&
      pr?.state === "open" &&
      pr.capabilities.review.inlineComment &&
      pr.viewerPermissions.comment &&
      pr.capabilities.review.verdicts.some((verdict) =>
        pr.viewerPermissions.verdicts.includes(verdict),
      ),
    canReply:
      connected &&
      canReply &&
      pr?.capabilities.review.reply === true &&
      pr.viewerPermissions.comment,
    canResolve:
      connected &&
      canResolve &&
      pr?.capabilities.review.resolve === true &&
      pr.viewerPermissions.resolve,
    canWrite: connected && canWrite,
    canComment:
      connected && canComment && pr?.capabilities.comment === true && pr.viewerPermissions.comment,
    verdicts:
      connected && canReview && pr?.state === "open"
        ? pr.capabilities.review.verdicts.filter((verdict) =>
            pr.viewerPermissions.verdicts.includes(verdict),
          )
        : [],
  };
}
