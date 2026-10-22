import type { ArchivedSnapshotEntry } from "@vekrel/client-runtime/state/threads";
import {
  scopeProject,
  scopeThreadShell,
  type MachineProject,
  type MachineThreadShell,
} from "@vekrel/client-runtime/state/shell";
import type { MachineId } from "@vekrel/contracts";
import * as Arr from "effect/Array";
import * as Order from "effect/Order";

import { scopedProjectKey } from "../../lib/scopedEntities";

export type ArchivedThreadSortOrder = "newest" | "oldest";

export interface ArchivedThreadGroup {
  readonly key: string;
  readonly project: MachineProject;
  readonly threads: ReadonlyArray<MachineThreadShell>;
}

function archiveTimestamp(thread: MachineThreadShell): number {
  const timestamp = Date.parse(thread.archivedAt ?? thread.updatedAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function matchesQuery(value: string | null, query: string): boolean {
  return value?.toLocaleLowerCase().includes(query) ?? false;
}

export function buildArchivedThreadGroups(input: {
  readonly snapshots: ReadonlyArray<ArchivedSnapshotEntry>;
  readonly machineLabels: Readonly<Record<string, string>>;
  readonly machineId: MachineId | null;
  readonly searchQuery: string;
  readonly sortOrder: ArchivedThreadSortOrder;
}): ReadonlyArray<ArchivedThreadGroup> {
  const query = input.searchQuery.trim().toLocaleLowerCase();
  const groups: ArchivedThreadGroup[] = [];

  for (const entry of input.snapshots) {
    if (input.machineId !== null && input.machineId !== entry.machineId) {
      continue;
    }

    const machineLabel = input.machineLabels[entry.machineId] ?? null;
    const threadsByProjectId = new Map<string, MachineThreadShell[]>();
    for (const thread of entry.snapshot.threads) {
      if (thread.archivedAt === null) {
        continue;
      }
      const threads = threadsByProjectId.get(thread.projectId) ?? [];
      threads.push(scopeThreadShell(entry.machineId, thread));
      threadsByProjectId.set(thread.projectId, threads);
    }

    for (const rawProject of entry.snapshot.projects) {
      const project = scopeProject(entry.machineId, rawProject);
      const projectThreads = threadsByProjectId.get(project.id) ?? [];
      const groupMatches =
        query.length === 0 ||
        matchesQuery(project.title, query) ||
        matchesQuery(project.workspaceRoot, query) ||
        matchesQuery(machineLabel, query);
      const matchingThreads = groupMatches
        ? projectThreads
        : projectThreads.filter(
            (thread) => matchesQuery(thread.title, query) || matchesQuery(thread.branch, query),
          );

      if (matchingThreads.length === 0) {
        continue;
      }

      const timestampOrder = input.sortOrder === "newest" ? Order.flip(Order.Number) : Order.Number;
      groups.push({
        key: scopedProjectKey(project.machineId, project.id),
        project,
        threads: Arr.sort(
          matchingThreads,
          Order.mapInput(
            Order.Struct({ timestamp: timestampOrder, title: Order.String, id: Order.String }),
            (thread: MachineThreadShell) => ({
              timestamp: archiveTimestamp(thread),
              title: thread.title,
              id: thread.id,
            }),
          ),
        ),
      });
    }
  }

  const timestampOrder = input.sortOrder === "newest" ? Order.flip(Order.Number) : Order.Number;
  return Arr.sort(
    groups,
    Order.mapInput(
      Order.Struct({ timestamp: timestampOrder, title: Order.String, key: Order.String }),
      (group: ArchivedThreadGroup) => ({
        timestamp: group.threads[0] ? archiveTimestamp(group.threads[0]) : 0,
        title: group.project.title,
        key: group.key,
      }),
    ),
  );
}
