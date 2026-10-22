import type { Action } from "expo-quick-actions";
import type { NavigationState } from "@react-navigation/native";
import { MachineId, ThreadId, type ScopedThreadRef } from "@vekrel/contracts";

import type { RecentThreadShortcut } from "../../persistence/imperative";

export const MAX_RECENT_THREAD_SHORTCUTS = 3;

export const NEW_TASK_SHORTCUT_ID = "new-task";
const NEW_TASK_SHORTCUT_HREF = "/new";

const SHORTCUT_ICON = "shortcut_icon";

const THREAD_SHORTCUT_HREF_PATTERN = /^\/threads\/[^/?#]+\/[^/?#]+$/;

function threadShortcutHref(thread: RecentThreadShortcut): string {
  return `/threads/${encodeURIComponent(thread.machineId)}/${encodeURIComponent(thread.threadId)}`;
}

function firstRouteParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

/**
 * Never throws: route params can arrive malformed from external deep links or restored state, the
 * branded id constructors throw on values failing their schema, and this runs during render of
 * the root stack layout — an uncaught throw here would take down the whole navigation tree.
 */
export function activeThreadRef(state: NavigationState): ScopedThreadRef | null {
  const route = state.routes[state.index];
  if (route?.name !== "Thread") {
    return null;
  }

  try {
    const params = route.params as
      | {
          readonly machineId?: string | string[];
          readonly threadId?: string | string[];
        }
      | undefined;
    const machineId = firstRouteParam(params?.machineId)?.trim();
    const threadId = firstRouteParam(params?.threadId)?.trim();
    if (!machineId || !threadId) {
      return null;
    }

    return {
      machineId: MachineId.make(machineId),
      threadId: ThreadId.make(threadId),
    };
  } catch {
    return null;
  }
}

function threadShortcutLabel(thread: RecentThreadShortcut): string {
  const title = thread.title.trim();
  return title.length > 0 ? title : "Thread";
}

/**
 * In-app navigation path carried by a shortcut, or null for anything
 * malformed — shortcuts persist in the launcher across app updates, so this
 * allowlists the exact destinations shortcuts can produce rather than
 * trusting any path-shaped string (`//host`, arbitrary routes, stale
 * persisted junk all navigate nowhere).
 */
export function shortcutHref(action: Action): string | null {
  const href = action.params?.href;
  if (typeof href !== "string") {
    return null;
  }

  return href === NEW_TASK_SHORTCUT_HREF || THREAD_SHORTCUT_HREF_PATTERN.test(href) ? href : null;
}

export function withRecentThreadShortcut(
  current: ReadonlyArray<RecentThreadShortcut>,
  opened: RecentThreadShortcut,
): ReadonlyArray<RecentThreadShortcut> {
  const existing = current.find(
    (thread) =>
      thread.machineId === opened.machineId && thread.threadId === opened.threadId,
  );
  const title = opened.title.trim().length > 0 ? opened.title : (existing?.title ?? opened.title);
  if (current[0] === existing && existing !== undefined && existing.title === title) {
    return current;
  }

  return [
    { machineId: opened.machineId, threadId: opened.threadId, title },
    ...current.filter((thread) => thread !== existing),
  ].slice(0, MAX_RECENT_THREAD_SHORTCUTS);
}

export function buildShortcutActions(recents: ReadonlyArray<RecentThreadShortcut>): Action[] {
  return [
    {
      id: NEW_TASK_SHORTCUT_ID,
      title: "New task",
      icon: SHORTCUT_ICON,
      params: { href: NEW_TASK_SHORTCUT_HREF },
    },
    ...recents.slice(0, MAX_RECENT_THREAD_SHORTCUTS).map((thread): Action => ({
      // The encoded href doubles as the launcher id: URI-encoding makes the
      // env/thread join unambiguous (a plain `-` join lets different pairs
      // collide and overwrite each other's launcher slots).
      id: `thread:${threadShortcutHref(thread)}`,
      title: threadShortcutLabel(thread),
      icon: SHORTCUT_ICON,
      params: { href: threadShortcutHref(thread) },
    })),
  ];
}
