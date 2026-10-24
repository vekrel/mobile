import * as ExpoCrypto from "expo-crypto";

interface CryptoHost {
  crypto?: { getRandomValues?: unknown };
}

/**
 * Account sign-in (`@vekrel/shared/connectAuth`) draws PKCE verifiers and state from
 * `crypto.getRandomValues`, which Hermes may not provide. Fills only that gap.
 */
export function installCryptoShim(host: CryptoHost = globalThis as CryptoHost): void {
  if (typeof host.crypto?.getRandomValues === "function") return;
  host.crypto ??= {};
  host.crypto.getRandomValues = ExpoCrypto.getRandomValues;
}

// Runs on import: index.ts imports this before the app, so before any auth code.
installCryptoShim();
