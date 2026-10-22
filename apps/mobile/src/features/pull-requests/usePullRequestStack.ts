import { threadPullRequestLinkMode } from "@vekrel/client-runtime/thread-pull-request-compatibility";
import type { PullRequestDetail } from "@vekrel/contracts";
import { parseChangeRequestUrl } from "@vekrel/shared/changeRequestUrl";
import { useMemo } from "react";
import { useMachineServerConfig, useNavigationThreadShells } from "../../state/entities";
import { pullRequestStackAtom } from "../../state/pull-requests";
import { useMachineQuery } from "../../state/query";
import { savedPullRequestStack } from "./pullRequestStack";
import { pullRequestTarget, type PullRequestParams } from "./usePullRequestDiff";

export function usePullRequestStack(params: PullRequestParams, pr: PullRequestDetail | null) {
  const target = pullRequestTarget(params);
  const config = useMachineServerConfig(target.machineId);
  const threads = useNavigationThreadShells();
  const supported =
    threadPullRequestLinkMode(config?.machine.capabilities) === "multiple" &&
    pr?.capabilities.stacks === true;
  const reference = useMemo(
    () => ({
      ...pullRequestTarget(params).input,
      host: params.host ?? (pr ? parseChangeRequestUrl(pr.url)?.host : undefined),
    }),
    [params, pr],
  );
  const saved = useMemo(
    () =>
      savedPullRequestStack(
        threads
          .filter((thread) => thread.machineId === target.machineId)
          .flatMap((thread) => thread.pullRequests ?? []),
        reference,
      ),
    [threads, target.machineId, reference],
  );
  const query = useMachineQuery(
    supported ? pullRequestStackAtom({ ...target, input: reference }) : null,
  );
  const stack = query.isSuccess ? query.data : (query.data ?? saved);
  return {
    ...query,
    stack,
    isFresh: supported && query.isSuccess && !query.isPending,
    supportsStackActions:
      supported &&
      pr?.capabilities.stackActions === true &&
      config?.machine.capabilities.pullRequestStackActions === true,
  };
}

export type PullRequestStackState = ReturnType<typeof usePullRequestStack>;
