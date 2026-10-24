import { AccountClientId, createAccountSession } from "@vekrel/client-runtime/account-auth";
import * as WebBrowser from "expo-web-browser";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  accountRedirectUri,
  clearStoredAccount,
  readStoredAccount,
  refreshTokenStore,
  signInWithBrowser,
} from "./accountSession";

const secureStore = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn((key: string) => Promise.resolve(secureStore.get(key) ?? null)),
  setItemAsync: vi.fn((key: string, value: string) => {
    secureStore.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: vi.fn((key: string) => {
    secureStore.delete(key);
    return Promise.resolve();
  }),
}));

vi.mock("expo-constants", () => ({ default: { expoConfig: { scheme: "vekrel-dev" } } }));

vi.mock("expo-web-browser", () => ({
  openAuthSessionAsync: vi.fn(),
  WebBrowserResultType: { CANCEL: "cancel" },
}));

const RELAY_URL = "https://relay.example.test";

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

const accessToken = `${base64Url({ alg: "EdDSA" })}.${base64Url({
  sub: "usr_1",
  email: "a@example.test",
  exp: 4_000_000_000,
})}.sig`;

function fakeRelay() {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
    Response.json({ access_token: accessToken, expires_in: 600, refresh_token: "refresh-1" }),
  );
  const session = createAccountSession({
    relayUrl: RELAY_URL,
    clientId: AccountClientId.mobile,
    store: refreshTokenStore,
    fetch,
  });
  return { fetch, session };
}

/** The browser returns to the app with `code` and the given `state` (default: the one sent). */
function browserReturns(state?: string) {
  vi.mocked(WebBrowser.openAuthSessionAsync).mockImplementation(async (url, redirectUri) => {
    const sent = new URL(url).searchParams.get("state");
    return { type: "success", url: `${redirectUri}?code=code-1&state=${state ?? sent}` };
  });
}

beforeEach(() => {
  secureStore.clear();
  vi.clearAllMocks();
});

describe("accountRedirectUri", () => {
  it("uses the app variant's scheme", () => {
    expect(accountRedirectUri()).toBe("vekrel-dev://auth/callback");
    expect(accountRedirectUri("vekrel")).toBe("vekrel://auth/callback");
    expect(accountRedirectUri(["vekrel", "other"])).toBe("vekrel://auth/callback");
  });
});

describe("signInWithBrowser", () => {
  it("opens the relay authorize page and stores the refresh token and account", async () => {
    const { fetch, session } = fakeRelay();
    browserReturns();

    await expect(signInWithBrowser(session, RELAY_URL)).resolves.toEqual({
      userId: "usr_1",
      email: "a@example.test",
    });

    const [authorizeUrl, redirectUri] = vi.mocked(WebBrowser.openAuthSessionAsync).mock.calls[0]!;
    const authorize = new URL(authorizeUrl);
    expect(`${authorize.origin}${authorize.pathname}`).toBe(`${RELAY_URL}/oauth/authorize`);
    expect(authorize.searchParams.get("client_id")).toBe("vekrel-mobile");
    expect(authorize.searchParams.get("redirect_uri")).toBe("vekrel-dev://auth/callback");
    expect(redirectUri).toBe("vekrel-dev://auth/callback");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await refreshTokenStore.read()).toBe("refresh-1");
    // SecureStore round-trip: a relaunch reads the same account without the relay.
    await expect(readStoredAccount()).resolves.toEqual({
      userId: "usr_1",
      email: "a@example.test",
    });
  });

  it("refuses a callback with a foreign state and stores nothing", async () => {
    const { fetch, session } = fakeRelay();
    browserReturns("forged");

    await expect(signInWithBrowser(session, RELAY_URL)).rejects.toMatchObject({
      reason: "state-mismatch",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(secureStore.size).toBe(0);
  });

  it("returns null when the user closes the browser", async () => {
    const { fetch, session } = fakeRelay();
    vi.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
      type: WebBrowser.WebBrowserResultType.CANCEL,
    });

    await expect(signInWithBrowser(session, RELAY_URL)).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("readStoredAccount", () => {
  it("is signed out without a refresh token or after the account is cleared", async () => {
    const { session } = fakeRelay();
    browserReturns();
    await signInWithBrowser(session, RELAY_URL);

    await clearStoredAccount();
    await expect(readStoredAccount()).resolves.toBeNull();

    secureStore.clear();
    secureStore.set("vekrel.cloud.account", JSON.stringify({ userId: "usr_1", email: null }));
    await expect(readStoredAccount()).resolves.toBeNull();
  });
});
