import {
  AccountClientId,
  type AccountSession,
  beginSignIn,
  type RefreshTokenStore,
} from "@vekrel/client-runtime/account-auth";
import { decodeRelayJwt } from "@vekrel/shared/relayJwt";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";

const REFRESH_TOKEN_KEY = "vekrel.cloud.account-refresh-token";
// The signed-in account, kept so an offline launch stays signed in (and keeps its machines)
// without asking the relay.
const ACCOUNT_KEY = "vekrel.cloud.account";

export interface CloudAccount {
  readonly userId: string;
  readonly email: string | null;
}

function secureStoreItem(key: string): RefreshTokenStore {
  return {
    read: () => SecureStore.getItemAsync(key),
    write: (value) => SecureStore.setItemAsync(key, value),
    clear: () => SecureStore.deleteItemAsync(key),
  };
}

export const refreshTokenStore = secureStoreItem(REFRESH_TOKEN_KEY);
const accountStore = secureStoreItem(ACCOUNT_KEY);

/** `vekrel://auth/callback` (or the dev/preview variant's scheme). */
export function accountRedirectUri(scheme: unknown = Constants.expoConfig?.scheme): string {
  return `${Array.isArray(scheme) ? scheme[0] : scheme}://auth/callback`;
}

export function readAccountFromToken(accessToken: string): CloudAccount {
  const { sub, email } = decodeRelayJwt(accessToken);
  if (typeof sub !== "string" || !sub) {
    throw new Error("The account token has no subject.");
  }
  return { userId: sub, email: typeof email === "string" ? email : null };
}

export async function readStoredAccount(): Promise<CloudAccount | null> {
  const [refreshToken, raw] = await Promise.all([refreshTokenStore.read(), accountStore.read()]);
  if (!refreshToken || !raw) return null;
  try {
    const value = JSON.parse(raw) as { readonly userId?: unknown; readonly email?: unknown };
    return typeof value.userId === "string" && value.userId
      ? { userId: value.userId, email: typeof value.email === "string" ? value.email : null }
      : null;
  } catch {
    return null;
  }
}

export const clearStoredAccount = () => accountStore.clear();

/**
 * Opens the relay's sign-in page in the system browser auth session and finishes the code
 * exchange. `null` when the user closes the browser.
 */
export async function signInWithBrowser(
  session: AccountSession,
  relayUrl: string,
): Promise<CloudAccount | null> {
  const redirectUri = accountRedirectUri();
  const { url, pending } = beginSignIn({ relayUrl, clientId: AccountClientId.mobile, redirectUri });
  const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);
  if (result.type !== "success") return null;
  await session.completeSignIn(result.url, pending);
  const accessToken = await session.getAccessToken();
  if (!accessToken) return null;
  const account = readAccountFromToken(accessToken);
  await accountStore.write(JSON.stringify(account));
  return account;
}

/**
 * Unregisters this device (and with it the account's Live Activities on the relay) while the
 * session can still authenticate, then revokes. A failed unregister still signs out.
 * Deviation from upstream: its unregister ran after sign-out with no token and was skipped,
 * so a signed-out phone kept getting the old account's pushes.
 */
export async function signOutAccount(
  session: AccountSession,
  unregisterDevice: (tokenProvider: () => Promise<string | null>) => Promise<unknown>,
): Promise<void> {
  try {
    await unregisterDevice(session.getAccessToken);
  } catch (cause) {
    console.warn("[vekrel-connect] Device unregistration before sign-out failed", cause);
  }
  await session.signOut();
}
