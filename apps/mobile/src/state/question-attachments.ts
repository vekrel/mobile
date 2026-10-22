import type { MachineId, ThreadId } from "@vekrel/contracts";
import { Atom } from "effect/reactivity";
import { appAtomRegistry } from "./atom-registry";

export function questionAttachmentDraftPrefix(
  machineId: MachineId,
  threadId: ThreadId,
): string {
  return `${machineId}:question-${encodeURIComponent(JSON.stringify(threadId))}-`;
}
export function questionAttachmentDraftKey(
  machineId: MachineId,
  threadId: ThreadId,
  requestId: string,
  questionId: string,
): string {
  return `${questionAttachmentDraftPrefix(machineId, threadId)}${encodeURIComponent(JSON.stringify([requestId, questionId]))}`;
}
export const questionAttachmentPreparationAtom = Atom.make<Record<string, number>>({}).pipe(
  Atom.keepAlive,
);
export function changeQuestionAttachmentPreparation(key: string, delta: number): void {
  const counts = appAtomRegistry.get(questionAttachmentPreparationAtom);
  if (delta < 0 && !(key in counts)) return;
  appAtomRegistry.set(questionAttachmentPreparationAtom, {
    ...counts,
    [key]: Math.max(0, (counts[key] ?? 0) + delta),
  });
}
