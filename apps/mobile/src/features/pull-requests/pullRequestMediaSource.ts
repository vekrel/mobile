import type { MachineId } from "@vekrel/contracts";
import { githubMediaFetchUrl } from "@vekrel/shared/githubMedia";
import type { FilePreviewItem } from "../../components/FilePreviewModal.types";

export interface PullRequestMediaLocation {
  readonly machineId: MachineId;
  readonly cwd: string;
}

/** Keep the original resource identity so previewers can resolve and renew its capability. */
export function pullRequestMediaSource(url: string, location: PullRequestMediaLocation | null) {
  const fetchUrl = githubMediaFetchUrl(url);
  return location && fetchUrl
    ? {
        machineId: location.machineId,
        resource: { _tag: "github-media" as const, cwd: location.cwd, url: fetchUrl },
      }
    : { uri: url };
}

export function pullRequestImageSource(
  url: string,
  location: PullRequestMediaLocation | null,
): FilePreviewItem {
  return { kind: "image", ...pullRequestMediaSource(url, location) };
}
