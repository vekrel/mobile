import {
  composerPullRequestsFromLinks,
  filterComposerPullRequestMatches,
} from "@vekrel/shared/composerPullRequestMatches";
import { resolveFilesystemReadAccess } from "@vekrel/client-runtime/state/filesystem";
import { machineSession } from "./session";
import { useMachinePresentation } from "./presentation";
import type { VcsRefTarget } from "@vekrel/client-runtime/state/vcs";
import type {
  MachineId,
  OrchestrationV2ProjectedTurnItem,
  ProjectId,
  ThreadPullRequestLink,
  VcsListRefsResult,
  VcsRef,
} from "@vekrel/contracts";
import {
  createThreadSearchResultsAtomFamily,
  makeThreadSearchKey,
  type MachineThreadSearchMatch,
} from "@vekrel/client-runtime/state/thread-search";
import { useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import { turnItemDetailRevision } from "@vekrel/client-runtime/work-log/item-detail";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { useEffect, useState } from "react";

import { appAtomRegistry } from "./atom-registry";
import { orchestrationMachine } from "./orchestration";
import { projectMachine } from "./projects";
import { useMachineQuery } from "./query";
import { vcsMachine } from "./vcs";
import { composerPullRequests } from "./pull-requests";
import {
  buildCheckpointDiffTargets,
  normalizeComposerPathSearchQuery,
  type CheckpointDiffTarget,
} from "./queryTargets";

const COMPOSER_PATH_SEARCH_DEBOUNCE_MS = 200;
const COMPOSER_PATH_SEARCH_LIMIT = 20;
const THREAD_SEARCH_DEBOUNCE_MS = 200;
const VCS_REF_LIST_LIMIT = 100;
const EMPTY_REFS: ReadonlyArray<VcsRef> = [];
const INITIAL_BRANCH_CURSORS = [undefined] as const;
const EMPTY_THREAD_SEARCH_MATCHES: ReadonlyArray<MachineThreadSearchMatch> = Object.freeze([]);
const EMPTY_THREAD_SEARCH_ATOM = Atom.make({
  matches: EMPTY_THREAD_SEARCH_MATCHES,
  isLoading: false,
}).pipe(Atom.withLabel("mobile:thread-search:empty"));

const threadSearchResultsAtom = createThreadSearchResultsAtomFamily({
  getSearchAtom: (machineId, query) =>
    orchestrationMachine.threadSearch({
      machineId,
      input: { query },
    }),
  labelPrefix: "mobile:thread-search",
});

export interface ComposerPathSearchTarget {
  readonly machineId: MachineId | null;
  readonly cwd: string | null;
  readonly query: string | null;
}

export function useDebouncedValue<A>(value: A, delayMs: number): A {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [delayMs, value]);

  return debounced;
}

export function useComposerPullRequestSearch(input: {
  machineId: MachineId | null;
  projectId: ProjectId | null;
  repository: string | null;
  threadPullRequests?: ReadonlyArray<ThreadPullRequestLink> | undefined;
  query: string | null;
}) {
  const query = useDebouncedValue(input.query, 180);
  const linked =
    input.projectId === null
      ? []
      : composerPullRequestsFromLinks(input.threadPullRequests ?? [], input.projectId);
  const ready =
    query === input.query &&
    query !== null &&
    input.machineId !== null &&
    input.projectId !== null &&
    input.repository !== null;
  const numeric = query !== null && /^\d*$/.test(query);
  const list = useMachineQuery(
    ready
      ? composerPullRequests.list({
          machineId: input.machineId!,
          input: {
            projectId: input.projectId!,
            state: "all",
            limit: 200,
            ...(!numeric && query ? { query } : {}),
          },
        })
      : null,
  );
  const number = numeric && query ? Number(query) : null;
  const hasExact = list.data?.entries.some(
    (entry) =>
      entry.number === number && entry.repository.toLowerCase() === input.repository?.toLowerCase(),
  );
  const exact = useMachineQuery(
    ready && number !== null && Number.isSafeInteger(number) && number > 0 && !hasExact
      ? composerPullRequests.detail({
          machineId: input.machineId!,
          input: { projectId: input.projectId!, repository: input.repository!, number },
        })
      : null,
  );
  const entries = (() => {
    if (!ready) return [];
    if (numeric) {
      return filterComposerPullRequestMatches({
        entries: [...(exact.data ? [exact.data] : []), ...(list.data?.entries ?? [])],
        linked,
        projectId: input.projectId!,
        repository: input.repository!,
        query: query ?? "",
        limit: 20,
      });
    }
    const words = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const found = [...(exact.data ? [exact.data] : []), ...(list.data?.entries ?? [])].filter(
      (entry) =>
        entry.projectId === input.projectId &&
        entry.repository.toLowerCase() === input.repository?.toLowerCase() &&
        words.every((word) =>
          `${entry.title} ${entry.headBranch} ${entry.baseBranch}`.toLowerCase().includes(word),
        ),
    );
    const unique = new Map<number, (typeof found)[number]>();
    for (const entry of found) if (!unique.has(entry.number)) unique.set(entry.number, entry);
    return [...unique.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 20);
  })();
  return {
    entries,
    isPending: input.query !== null && (query !== input.query || list.isPending || exact.isPending),
    error: list.error ?? list.data?.errors[0]?.message ?? exact.error,
  };
}

export function useThreadSearch(
  machineIds: ReadonlyArray<MachineId>,
  query: string,
): {
  readonly matches: ReadonlyArray<MachineThreadSearchMatch>;
  readonly isPending: boolean;
} {
  const normalizedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(normalizedQuery, THREAD_SEARCH_DEBOUNCE_MS);
  const canSearch = machineIds.length > 0 && normalizedQuery.length >= 2;
  const settledQuery = canSearch && normalizedQuery === debouncedQuery ? debouncedQuery : null;
  const searchKey =
    settledQuery === null ? null : makeThreadSearchKey(machineIds, settledQuery);
  const result = useAtomValue(
    searchKey === null ? EMPTY_THREAD_SEARCH_ATOM : threadSearchResultsAtom(searchKey),
  );
  const isDebouncing = canSearch && normalizedQuery !== debouncedQuery;
  return {
    matches: isDebouncing ? EMPTY_THREAD_SEARCH_MATCHES : result.matches,
    isPending: canSearch && (isDebouncing || result.isLoading),
  };
}

export function useBranches(input: {
  readonly machineId: MachineId | null;
  readonly cwd: string | null;
  readonly query?: string | null;
}) {
  const query = input.query?.trim() ?? "";
  return useMachineQuery(
    input.machineId !== null && input.cwd !== null
      ? vcsMachine.listRefs({
          machineId: input.machineId,
          input: {
            cwd: input.cwd,
            ...(query.length > 0 ? { query } : {}),
            limit: VCS_REF_LIST_LIMIT,
          },
        })
      : null,
  );
}

export function usePaginatedBranches(target: VcsRefTarget) {
  const query = target.query?.trim() ?? "";
  const targetKey =
    target.machineId !== null && target.cwd !== null
      ? JSON.stringify([target.machineId, target.cwd, query])
      : null;
  const [pagination, setPagination] = useState<{
    readonly targetKey: string | null;
    readonly cursors: ReadonlyArray<number | undefined>;
  }>({
    targetKey,
    cursors: INITIAL_BRANCH_CURSORS,
  });
  const cursors = pagination.targetKey === targetKey ? pagination.cursors : INITIAL_BRANCH_CURSORS;
  const pageAtoms =
    target.machineId !== null && target.cwd !== null
      ? cursors.map((cursor) =>
          vcsMachine.listRefs({
            machineId: target.machineId!,
            input: {
              cwd: target.cwd!,
              ...(query.length > 0 ? { query } : {}),
              ...(cursor === undefined ? {} : { cursor }),
              limit: VCS_REF_LIST_LIMIT,
            },
          }),
        )
      : [];
  const pagesAtom = Atom.make((get) => pageAtoms.map((atom) => get(atom))).pipe(
    Atom.withLabel(`mobile:vcs-ref-pages:${targetKey ?? "empty"}`),
  );
  const results = useAtomValue(pagesAtom);
  const values = results.flatMap((result) => {
    const value = Option.getOrNull(AsyncResult.value(result));
    return value === null ? [] : [value];
  });
  const refs = new Map<string, VcsRef>();
  for (const value of values) {
    for (const ref of value.refs) {
      refs.set(ref.name, ref);
    }
  }
  const first = values[0] ?? null;
  const last = values.at(-1) ?? null;
  const data: VcsListRefsResult | null =
    first === null || last === null
      ? null
      : {
          refs: [...refs.values()],
          isRepo: first.isRepo,
          hasPrimaryRemote: first.hasPrimaryRemote,
          nextCursor: last.nextCursor,
          totalCount: Math.max(...values.map((value) => value.totalCount)),
        };
  const lastResult = results.at(-1);
  const isFetchingNextPage =
    results.length > 1 &&
    lastResult?.waiting === true &&
    Option.isNone(AsyncResult.value(lastResult));
  const failed = results.find((result) => result._tag === "Failure");
  const error =
    failed?._tag === "Failure"
      ? (() => {
          const cause = Cause.squash(failed.cause);
          return cause instanceof Error && cause.message.trim().length > 0
            ? cause.message
            : "Failed to load refs.";
        })()
      : null;
  const refresh = () => {
    const firstPage = pageAtoms[0];
    setPagination({ targetKey, cursors: INITIAL_BRANCH_CURSORS });
    if (firstPage !== undefined) {
      appAtomRegistry.refresh(firstPage);
    }
  };
  const loadNext = () => {
    if (targetKey === null || data?.nextCursor === null || data?.nextCursor === undefined) {
      return;
    }
    setPagination((current) => {
      const currentCursors =
        current.targetKey === targetKey ? current.cursors : INITIAL_BRANCH_CURSORS;
      return currentCursors.includes(data.nextCursor!)
        ? { targetKey, cursors: currentCursors }
        : { targetKey, cursors: [...currentCursors, data.nextCursor!] };
    });
  };

  return {
    data,
    refs: data?.refs ?? EMPTY_REFS,
    error,
    isPending: results.some((result) => result.waiting),
    isFetchingNextPage,
    refresh,
    loadNext,
  };
}

export function useComposerPathSearch(target: ComposerPathSearchTarget) {
  const normalizedTarget = {
    machineId: target.machineId,
    cwd: target.cwd,
    query: normalizeComposerPathSearchQuery(target.query),
  };
  const debouncedTarget = useDebouncedValue(normalizedTarget, COMPOSER_PATH_SEARCH_DEBOUNCE_MS);
  const fileAccessSession = useMachineQuery(
    debouncedTarget.machineId === null
      ? null
      : machineSession.sessionStateAtom(debouncedTarget.machineId),
  );
  const fileMachine = useMachinePresentation(debouncedTarget.machineId);
  const fileAccess = resolveFilesystemReadAccess({
    isCatalogReady: fileMachine.isReady,
    connection: fileMachine.presentation?.connection ?? null,
    session: fileAccessSession.data,
    sessionError: fileAccessSession.error,
  });
  const { canReadFiles } = fileAccess;
  const searchTarget =
    debouncedTarget.machineId !== null &&
    debouncedTarget.cwd !== null &&
    debouncedTarget.query.length > 0
      ? {
          machineId: debouncedTarget.machineId,
          input: {
            cwd: debouncedTarget.cwd,
            query: debouncedTarget.query,
            limit: COMPOSER_PATH_SEARCH_LIMIT,
          },
        }
      : null;
  const result = useMachineQuery(
    canReadFiles && searchTarget !== null ? projectMachine.searchEntries(searchTarget) : null,
  );
  const hasTarget = searchTarget !== null;

  return {
    entries: result.data?.entries ?? [],
    error:
      !hasTarget || fileAccess.isPending
        ? null
        : canReadFiles
          ? result.error
          : (fileAccess.error ?? "This connection cannot search host files."),
    isPending:
      normalizedTarget.query !== debouncedTarget.query ||
      (hasTarget && (fileAccess.isPending || result.isPending)),
    refresh: result.refresh,
  };
}

export function useCheckpointDiff(target: CheckpointDiffTarget) {
  const targets = buildCheckpointDiffTargets(target);
  const fullThread = useMachineQuery(
    targets.fullThread === null
      ? null
      : orchestrationMachine.fullThreadDiff(targets.fullThread),
  );
  const turn = useMachineQuery(
    targets.turn === null ? null : orchestrationMachine.turnDiff(targets.turn),
  );
  return targets.fullThread === null ? turn : fullThread;
}

export function useTurnItemDetail(
  target: {
    readonly machineId: MachineId;
    readonly row: OrchestrationV2ProjectedTurnItem;
  } | null,
) {
  return useMachineQuery(
    target === null
      ? null
      : orchestrationMachine.turnItem({
          machineId: target.machineId,
          input: {
            threadId: target.row.sourceThreadId,
            itemId: target.row.sourceItemId,
            revision: turnItemDetailRevision(target.row.item),
          },
        }),
  );
}
