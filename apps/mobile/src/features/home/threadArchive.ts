import {
  threadRuntimeCanArchive,
  type ThreadRuntimeSummary,
} from "@vekrel/client-runtime/state/models";

export function threadCanArchive(runtime: ThreadRuntimeSummary | null | undefined): boolean {
  return threadRuntimeCanArchive(runtime);
}
