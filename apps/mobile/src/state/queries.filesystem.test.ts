import { AuthFilesystemReadScope, MachineId, type AuthSessionState } from "@vekrel/contracts";
import { beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  session: null as Pick<AuthSessionState, "authenticated" | "scopes"> | null,
  sessionError: null as string | null,
  phase: "connected" as "connected" | "offline",
  sessionAtom: {},
  searchAtom: {},
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useCallback: <A>(callback: A) => callback,
  useEffect: () => {},
  useMemo: <A>(factory: () => A) => factory(),
  useState: <A>(value: A) => [value, vi.fn()],
}));
vi.mock("./session", () => ({
  machineSession: { sessionStateAtom: () => state.sessionAtom },
}));
vi.mock("./presentation", () => ({
  useMachinePresentation: () => ({
    isReady: true,
    presentation: { connection: { phase: state.phase, error: null } },
  }),
}));
vi.mock("./pull-requests", () => ({ composerPullRequests: {} }));
vi.mock("./projects", () => ({
  projectMachine: { searchEntries: () => state.searchAtom },
}));
vi.mock("./atom-registry", () => ({ appAtomRegistry: {} }));
vi.mock("./orchestration", () => ({ orchestrationMachine: {} }));
vi.mock("./threads", () => ({ useMachineThread: vi.fn() }));
vi.mock("./vcs", () => ({ vcsMachine: {} }));
vi.mock("./query", () => ({
  useMachineQuery: (atom: unknown) => ({
    data:
      atom === state.sessionAtom
        ? state.session
        : atom === state.searchAtom
          ? { entries: [{ path: "src/index.ts", kind: "file" }] }
          : null,
    error: atom === state.sessionAtom ? state.sessionError : null,
    isPending: atom === state.sessionAtom && state.session === null && state.sessionError === null,
    refresh: vi.fn(),
  }),
}));

import { useComposerPathSearch } from "./queries";

const target = {
  machineId: MachineId.make("test-machine"),
  cwd: "/repo",
  query: "src",
};

beforeEach(() => {
  state.session = null;
  state.sessionError = null;
  state.phase = "connected";
});

it("keeps a file search pending until its grant loads, then shows matches", () => {
  expect(useComposerPathSearch(target)).toMatchObject({
    entries: [],
    error: null,
    isPending: true,
  });
  state.session = { authenticated: true, scopes: [AuthFilesystemReadScope] };
  expect(useComposerPathSearch(target)).toMatchObject({
    entries: [{ path: "src/index.ts", kind: "file" }],
    error: null,
    isPending: false,
  });
});
