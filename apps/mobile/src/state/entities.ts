import { useAtomValue } from "@effect/atom-react";
import { deriveReportedModelSelection } from "@vekrel/client-runtime/state/thread-execution";

import { appAtomRegistry } from "./atom-registry";
import type {
  MachineProject,
  MachineThread,
  MachineThreadShell,
} from "@vekrel/client-runtime/state/shell";
import type {
  MachineId,
  ScopedProjectRef,
  ScopedThreadRef,
  ServerConfig,
  ThreadId,
} from "@vekrel/contracts";
import { hasThreadLinks, relabelThreadLinks } from "@vekrel/shared/threadLinks";
import { Atom } from "effect/reactivity";
import { useMemo } from "react";

import { machineProjects } from "./projects";
import { machineServerConfigsAtom, serverMachine } from "./server";
import { machineThreadDetails, machineThreadShells } from "./threads";

const EMPTY_PROJECT_ATOM = Atom.make<MachineProject | null>(null).pipe(
  Atom.withLabel("mobile-project:empty"),
);
const EMPTY_THREAD_SHELL_ATOM = Atom.make<MachineThreadShell | null>(null).pipe(
  Atom.withLabel("mobile-thread-shell:empty"),
);
const EMPTY_SERVER_CONFIG_ATOM = Atom.make<ServerConfig | null>(null).pipe(
  Atom.withLabel("mobile-server-config:empty"),
);
const EMPTY_THREAD_ATOM = Atom.make<MachineThread | null>(null).pipe(
  Atom.withLabel("mobile-thread:empty"),
);
const EMPTY_THREAD_TITLES: ReadonlyMap<ThreadId, string> = new Map();
const EMPTY_THREAD_TITLES_ATOM = Atom.make(EMPTY_THREAD_TITLES).pipe(
  Atom.withLabel("mobile-thread-titles:empty"),
);

const threadTitlesAtom = Atom.family((machineId: MachineId) => {
  let previous = EMPTY_THREAD_TITLES;
  return Atom.make((get) => {
    const index = get(machineThreadShells.machineThreadIndexAtom(machineId));
    const unchanged =
      index.size === previous.size &&
      Array.from(index).every(([threadId, shell]) => previous.get(threadId) === shell.title);
    if (!unchanged) {
      previous = new Map(Array.from(index, ([threadId, shell]) => [threadId, shell.title]));
    }
    return previous;
  }).pipe(Atom.withLabel(`mobile-thread-titles:${machineId}`));
});

export function waitForProject(
  ref: ScopedProjectRef,
  timeoutMs = 10_000,
): Promise<MachineProject | null> {
  const atom = machineProjects.projectAtom(ref);
  const current = appAtomRegistry.get(atom);
  if (current !== null) return Promise.resolve(current);
  return new Promise((resolve) => {
    let unsubscribe: (() => void) | null = null;
    const timeout = setTimeout(() => {
      unsubscribe?.();
      resolve(null);
    }, timeoutMs);
    const finish = (project: MachineProject | null) => {
      if (project === null) return;
      clearTimeout(timeout);
      unsubscribe?.();
      resolve(project);
    };
    unsubscribe = appAtomRegistry.subscribe(atom, finish);
    finish(appAtomRegistry.get(atom));
  });
}

export function useProjects(): ReadonlyArray<MachineProject> {
  return useAtomValue(machineProjects.projectsAtom);
}

export function useThreadShells(): ReadonlyArray<MachineThreadShell> {
  return useAtomValue(machineThreadShells.threadShellsAtom);
}

export function useNavigationThreadShells(): ReadonlyArray<MachineThreadShell> {
  return useAtomValue(machineThreadShells.navigationThreadShellsAtom);
}

export function useProject(ref: ScopedProjectRef | null): MachineProject | null {
  return useAtomValue(ref === null ? EMPTY_PROJECT_ATOM : machineProjects.projectAtom(ref));
}

export function useThreadShell(ref: ScopedThreadRef | null): MachineThreadShell | null {
  return useAtomValue(
    ref === null ? EMPTY_THREAD_SHELL_ATOM : machineThreadShells.threadShellAtom(ref),
  );
}

/** Streaming timestamps, item counts, and the latest message can be stale during a run. */
export function useQuietThreadShell(ref: ScopedThreadRef | null): MachineThreadShell | null {
  return useAtomValue(
    ref === null ? EMPTY_THREAD_SHELL_ATOM : machineThreadShells.quietThreadShellAtom(ref),
  );
}

export function useChildThreadInputs(ref: ScopedThreadRef) {
  return useAtomValue(machineThreadShells.childThreadInputsAtom(ref));
}

export function useLiveThreadLinkLabels(markdown: string, machineId: MachineId): string {
  const titles = useAtomValue(
    hasThreadLinks(markdown) ? threadTitlesAtom(machineId) : EMPTY_THREAD_TITLES_ATOM,
  );
  return useMemo(
    () =>
      titles.size === 0
        ? markdown
        : relabelThreadLinks(markdown, (threadId) => titles.get(threadId)),
    [markdown, titles],
  );
}

export function useMachineServerConfig(
  machineId: MachineId | null,
): ServerConfig | null {
  return useAtomValue(
    machineId === null
      ? EMPTY_SERVER_CONFIG_ATOM
      : serverMachine.configValueAtom(machineId),
  );
}

export function useServerConfigs(): ReadonlyMap<MachineId, ServerConfig> {
  return useAtomValue(machineServerConfigsAtom);
}

const selectReportedModelSelection = (thread: MachineThread | null) =>
  thread === null ? null : deriveReportedModelSelection(thread.projection);

export function useThreadReportedModelSelection(ref: ScopedThreadRef | null) {
  return useAtomValue(
    ref === null ? EMPTY_THREAD_ATOM : machineThreadDetails.threadAtom(ref),
    selectReportedModelSelection,
  );
}
