import { useAtomValue } from "@effect/atom-react";
import { parseScopedProjectKey, scopedProjectKey } from "@vekrel/client-runtime/machine";
import type { MachineId, ProjectCloneSnapshot, ScopedProjectRef } from "@vekrel/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";

import { serverMachine } from "./server";
import { sourceControlMachine } from "./sourceControl";

/**
 * `"pending"` while the machine's clone stream has not delivered its
 * first list yet: the draft opens right after a clone starts, and a caller
 * that treated the gap as "no clone" would enable Start for a moment.
 */
export type ProjectCloneState = ProjectCloneSnapshot | "pending" | null;

const EMPTY_CLONES: ReadonlyArray<ProjectCloneSnapshot> = [];
const EMPTY_CLONE_ATOM = Atom.make<ProjectCloneState>(null).pipe(
  Atom.withLabel("mobile-project-clone:empty"),
);

const machineProjectClonesAtom = Atom.family((machineId: MachineId) =>
  Atom.make((get): ReadonlyArray<ProjectCloneSnapshot> | "pending" => {
    const config = get(serverMachine.configValueAtom(machineId));
    if (config?.machine.capabilities.projectCloneTracking !== true) return EMPTY_CLONES;
    const result = get(sourceControlMachine.projectClones({ machineId, input: {} }));
    // A failed subscription must not hold Start forever. Treating it as
    // "no clone tracked" lets the server's own dispatch guard decide; the
    // registry re-establishes the stream on reconnect.
    if (result._tag === "Failure") return EMPTY_CLONES;
    return Option.getOrElse(AsyncResult.value(result), () => "pending" as const);
  }).pipe(Atom.withLabel(`mobile-project-clones:${machineId}`)),
);

export const machineProjectCloneListAtom = Atom.family((machineId: MachineId) =>
  Atom.make((get): ReadonlyArray<ProjectCloneSnapshot> => {
    const clones = get(machineProjectClonesAtom(machineId));
    return clones === "pending" ? EMPTY_CLONES : clones;
  }).pipe(Atom.withLabel(`mobile-project-clone-list:${machineId}`)),
);

const projectCloneAtom = Atom.family((key: string) => {
  const ref = parseScopedProjectKey(key);
  return Atom.make((get): ProjectCloneState => {
    if (ref === null) return null;
    const clones = get(machineProjectClonesAtom(ref.machineId));
    if (clones === "pending") return "pending";
    return clones.find((clone) => clone.projectId === ref.projectId) ?? null;
  }).pipe(Atom.withLabel(`mobile-project-clone:${key}`));
});

export function useProjectClone(ref: ScopedProjectRef | null): ProjectCloneState {
  return useAtomValue(ref === null ? EMPTY_CLONE_ATOM : projectCloneAtom(scopedProjectKey(ref)));
}
