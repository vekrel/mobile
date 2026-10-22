import {
  AuthFilesystemReadScope,
  MachineId,
  ThreadId,
  type AuthSessionState,
} from "@vekrel/contracts";
import { AsyncResult } from "effect/reactivity";
import { beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  sessions: new Map<string, Pick<AuthSessionState, "authenticated" | "scopes">>(),
  refresh: vi.fn(),
  download: vi.fn(),
  shareLocal: vi.fn(),
  shareDraft: vi.fn(),
  navigate: vi.fn(),
  copy: vi.fn(),
}));

vi.mock("react", () => ({
  useEffect: () => {},
  useRef: <A>(current: A) => ({ current }),
  useState: <A>(initial: A) => [initial, () => {}],
}));
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: state.navigate }),
}));
vi.mock("./markdownLinks", () => ({
  normalizeNativeMarkdownUrl: (uri: string) => uri,
}));
vi.mock("../state/assets", () => ({
  useRefreshAssetUrl: (machineId: string, resource: unknown) => () =>
    state.refresh(machineId, resource),
}));
vi.mock("../state/session", () => ({
  machineSession: { sessionStateAtom: (machineId: string) => machineId },
}));
vi.mock("../state/query", () => ({
  useMachineQuery: (machineId: string) => ({
    data: state.sessions.get(machineId) ?? null,
    error: null,
  }),
}));
vi.mock("../state/atom-registry", () => ({
  appAtomRegistry: {
    get: (machineId: string) => {
      const session = state.sessions.get(machineId);
      return session === undefined ? AsyncResult.initial() : AsyncResult.success(session);
    },
  },
}));
vi.mock("./attachmentDownload", () => ({
  downloadAndShareAttachment: state.download,
  shareLocalAttachment: state.shareLocal,
}));
vi.mock("./copyTextWithHaptic", () => ({ copyTextWithHaptic: state.copy }));
vi.mock("./localAttachmentPreview", () => ({
  loadLocalAttachmentPreview: async () => ({ share: state.shareDraft, dispose: vi.fn() }),
}));

import { useMediaActions } from "../state/mediaActions";
import type { MediaActionsSource } from "./mediaActionsSource";

const machineId = MachineId.make("media-machine");
const otherMachineId = MachineId.make("other-machine");
const threadId = ThreadId.make("media-thread");
const granted: Pick<AuthSessionState, "authenticated" | "scopes"> = {
  authenticated: true,
  scopes: [AuthFilesystemReadScope],
};
const denied: Pick<AuthSessionState, "authenticated" | "scopes"> = {
  authenticated: true,
  scopes: [],
};

function hostSource(_tag: "workspace-file" | "media-file" = "media-file"): MediaActionsSource {
  return {
    machineId,
    threadId,
    resource: { _tag, threadId, path: "/repo/image.png" },
    reference: { kind: "file", path: "/repo/image.png", relativePath: "image.png" },
    name: "image.png",
    mimeType: "image/png",
  };
}

beforeEach(() => {
  state.sessions.clear();
  state.sessions.set(machineId, denied);
  state.refresh.mockReset().mockResolvedValue("https://host.test/image.png");
  state.download.mockReset().mockResolvedValue(undefined);
  state.shareLocal.mockReset().mockResolvedValue(undefined);
  state.shareDraft.mockReset().mockResolvedValue(undefined);
  state.navigate.mockReset();
  state.copy.mockReset();
});

it.each(["workspace-file", "media-file"] as const)(
  "blocks denied %s sharing and file opening while preserving path copying",
  async (_tag) => {
    const media = useMediaActions(hostSource(_tag));
    await media.share();
    media.actions.find(({ id }) => id === "open-file")!.run();
    media.actions.find(({ id }) => id === "copy-full-path")!.run();

    expect(state.refresh).not.toHaveBeenCalled();
    expect(state.download).not.toHaveBeenCalled();
    expect(state.navigate).not.toHaveBeenCalled();
    expect(state.copy).toHaveBeenCalledWith("/repo/image.png");
    expect(media.actions.find(({ id }) => id === "save")?.disabled).toBe(true);
    expect(media.actions.find(({ id }) => id === "open-file")?.disabled).toBe(true);
  },
);

it("rechecks a retained menu action after revocation", async () => {
  state.sessions.set(machineId, granted);
  const media = useMediaActions(hostSource());
  state.sessions.set(machineId, denied);

  await media.share();
  media.actions.find(({ id }) => id === "open-file")!.run();

  expect(state.refresh).not.toHaveBeenCalled();
  expect(state.navigate).not.toHaveBeenCalled();
});

it("reenables sharing after gaining access while preserving a retained callback", async () => {
  const media = useMediaActions(hostSource());
  state.sessions.set(machineId, granted);

  await media.share();

  expect(state.download).toHaveBeenCalledOnce();
  expect(useMediaActions(hostSource()).actions.find(({ id }) => id === "save")?.disabled).toBe(
    false,
  );
});

it.each([false, true])("uses the media machine's grant (allowed: %s)", async (allowed) => {
  state.sessions.set(machineId, allowed ? granted : denied);
  state.sessions.set(otherMachineId, allowed ? denied : granted);

  await useMediaActions(hostSource()).share();

  expect(state.refresh).toHaveBeenCalledTimes(allowed ? 1 : 0);
  expect(state.download).toHaveBeenCalledTimes(allowed ? 1 : 0);
});

it("stops before downloading if access is revoked while the URL is refreshed", async () => {
  state.sessions.set(machineId, granted);
  state.refresh.mockImplementation(async () => {
    state.sessions.set(machineId, denied);
    return "https://host.test/image.png";
  });

  await useMediaActions(hostSource()).share();

  expect(state.refresh).toHaveBeenCalledOnce();
  expect(state.download).not.toHaveBeenCalled();
});

it("lets an unresolved grant be authorized by an explicit server request", async () => {
  state.sessions.delete(machineId);

  await useMediaActions(hostSource()).share();

  expect(state.refresh).toHaveBeenCalledOnce();
  expect(state.download).toHaveBeenCalledOnce();
});

it.each(["https://cdn.test/image.png", "file:///device/image.png"])(
  "shares direct media without a host grant: %s",
  async (uri) => {
    await useMediaActions({ uri, name: "image.png", mimeType: "image/png" }).share();

    expect(state.refresh).not.toHaveBeenCalled();
    expect(uri.startsWith("file:") ? state.shareLocal : state.download).toHaveBeenCalledOnce();
  },
);
