import { describe, expect, it } from "vite-plus/test";
import type { MachineProject } from "@vekrel/client-runtime/state/models";
import { pullRequestFallbackMachine } from "./pullRequestMachineFallback";

const project = (machineId: string, id: string, canonicalKey: string) =>
  ({
    machineId,
    id,
    repositoryIdentity: { canonicalKey },
  }) as unknown as MachineProject;

const projects = [
  project("laptop", "t3", "github.com/pingdotgg/t3code"),
  project("desktop", "other", "github.com/pingdotgg/other"),
  project("server", "t3-copy", "github.com/pingdotgg/t3code"),
];
const target = {
  machineId: "laptop",
  projectId: "t3",
  repository: "pingdotgg/t3code",
  host: "github.com",
};

describe("pullRequestFallbackMachine", () => {
  it("moves to a connected copy of the repository when the original is down", () => {
    expect(
      pullRequestFallbackMachine(target, projects, new Set(["desktop", "server"])),
    ).toEqual({ machineId: "server", projectId: "t3-copy" });
  });

  it("stays put while the original is connected or nothing else holds the repository", () => {
    expect(pullRequestFallbackMachine(target, projects, new Set(["laptop", "server"]))).toBe(
      null,
    );
    expect(pullRequestFallbackMachine(target, projects, new Set(["desktop"]))).toBe(null);
  });

  it("derives the host from the original project when the route has none", () => {
    const { host: _host, ...hostless } = target;
    expect(pullRequestFallbackMachine(hostless, projects, new Set(["server"]))).toEqual({
      machineId: "server",
      projectId: "t3-copy",
    });
  });
});
