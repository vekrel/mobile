import {
  AuthOrchestrationOperateScope,
  AuthProvidersManageScope,
  MachineId,
  type AuthSessionState,
} from "@vekrel/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom } from "effect/reactivity";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const harness = vi.hoisted(() => ({ lastAtom: null as Atom.Atom<unknown> | null }));
vi.mock("react", () => ({ useMemo: <A>(factory: () => A) => factory() }));
vi.mock("@effect/atom-react", async () => {
  const { appAtomRegistry } = await import("./atom-registry");
  return {
    useAtomValue: <A>(atom: Atom.Atom<A>) => {
      harness.lastAtom = atom;
      return appAtomRegistry.get(atom);
    },
  };
});
vi.mock("../connection/runtime", () => ({ connectionAtomRuntime: {} }));
vi.mock("@vekrel/client-runtime/state/session", () => ({
  createMachineSessionAtoms: () => ({
    sessionStateAtom: Atom.family((_id: MachineId) =>
      Atom.make(AsyncResult.initial<AuthSessionState, Error>()).pipe(Atom.keepAlive),
    ),
  }),
}));

import { appAtomRegistry } from "./atom-registry";
import {
  machineSession,
  readMachineScope,
  useMachineScope,
  useMachinesWithScope,
} from "./session";

const primary = MachineId.make("primary");
const secondary = MachineId.make("secondary");
const session = (canOperate: boolean): AuthSessionState => ({
  authenticated: true,
  scopes: canOperate ? [AuthOrchestrationOperateScope] : [],
  auth: {
    policy: "remote-reachable",
    bootstrapMethods: [],
    sessionMethods: [],
    sessionCookieName: "session",
  },
});
const source = (id: MachineId) =>
  machineSession.sessionStateAtom(id) as unknown as Atom.Writable<
    AsyncResult.AsyncResult<AuthSessionState, Error>
  >;
const releases: Array<() => void> = [];
beforeEach(() => {
  harness.lastAtom = null;
  appAtomRegistry.set(source(primary), AsyncResult.success(session(true)));
  appAtomRegistry.set(source(secondary), AsyncResult.initial());
});
afterEach(() => {
  releases.splice(0).forEach((release) => release());
});

it("keeps pending and denied machines out of worker grants while retaining valid cached access", () => {
  expect(useMachineScope(secondary, AuthOrchestrationOperateScope)).toBe(false);
  expect(readMachineScope(secondary, AuthOrchestrationOperateScope)).toBe(false);
  const machines = [{ machineId: primary }, { machineId: secondary }];
  expect(useMachinesWithScope(machines, AuthOrchestrationOperateScope)).toEqual(
    new Set([primary]),
  );
  appAtomRegistry.set(source(secondary), AsyncResult.waiting(AsyncResult.success(session(true))));
  expect(readMachineScope(secondary, AuthOrchestrationOperateScope)).toBe(true);
  expect(useMachinesWithScope(machines, AuthOrchestrationOperateScope)).toEqual(
    new Set([primary, secondary]),
  );
  appAtomRegistry.set(source(secondary), AsyncResult.success(session(false)));
  expect(useMachineScope(secondary, AuthOrchestrationOperateScope)).toBe(false);
});

it("reacts to grant revocation, failure, and regrant without a connection list change", () => {
  const machines = [{ machineId: primary }, { machineId: secondary }];
  useMachinesWithScope(machines, AuthOrchestrationOperateScope);
  const observed = harness.lastAtom;
  if (!observed) throw new Error("Missing worker grant atom");
  const changes: unknown[] = [];
  releases.push(appAtomRegistry.subscribe(observed, (value) => changes.push(value)));
  appAtomRegistry.set(source(secondary), AsyncResult.success(session(true)));
  expect(appAtomRegistry.get(observed)).toEqual(new Set([primary, secondary]));
  appAtomRegistry.set(source(secondary), AsyncResult.success(session(false)));
  expect(appAtomRegistry.get(observed)).toEqual(new Set([primary]));
  appAtomRegistry.set(
    source(primary),
    AsyncResult.failure(Cause.fail(new Error("Session lookup failed"))),
  );
  expect(appAtomRegistry.get(observed)).toEqual(new Set());
  appAtomRegistry.set(source(secondary), AsyncResult.success(session(true)));
  expect(appAtomRegistry.get(observed)).toEqual(new Set([secondary]));
  expect(changes).not.toHaveLength(0);
});

it("uses exact new-server permissions and keeps old-server grants usable", () => {
  appAtomRegistry.set(source(primary), AsyncResult.success({ ...session(true), permissions: [] }));
  expect(useMachineScope(primary, AuthOrchestrationOperateScope)).toBe(false);
  expect(readMachineScope(primary, AuthOrchestrationOperateScope)).toBe(false);
  appAtomRegistry.set(
    source(primary),
    AsyncResult.success({ ...session(false), permissions: [AuthOrchestrationOperateScope] }),
  );
  expect(useMachineScope(primary, AuthOrchestrationOperateScope)).toBe(true);
  expect(readMachineScope(primary, AuthOrchestrationOperateScope)).toBe(true);
  appAtomRegistry.set(source(primary), AsyncResult.success(session(true)));
  expect(useMachineScope(primary, AuthOrchestrationOperateScope)).toBe(true);
});

it("limits provider accounts to machines granting provider management", () => {
  const machines = [{ machineId: primary }, { machineId: secondary }];
  const permitted = () => useMachinesWithScope(machines, AuthProvidersManageScope);
  appAtomRegistry.set(
    source(primary),
    AsyncResult.success({ ...session(true), permissions: [AuthOrchestrationOperateScope] }),
  );
  expect(permitted()).toEqual(new Set());
  appAtomRegistry.set(
    source(secondary),
    AsyncResult.success({ ...session(false), permissions: [AuthProvidersManageScope] }),
  );
  expect(permitted()).toEqual(new Set([secondary]));
  appAtomRegistry.set(source(primary), AsyncResult.success(session(true)));
  expect(permitted()).toEqual(new Set([primary, secondary]));
  appAtomRegistry.set(
    source(secondary),
    AsyncResult.success({ ...session(true), scopes: [AuthProvidersManageScope], permissions: [] }),
  );
  expect(permitted()).toEqual(new Set([primary]));
});
