import { AccountClientId, createAccountSession } from "@vekrel/client-runtime/account-auth";
import { ManagedRelay, setManagedRelaySession } from "@vekrel/client-runtime/relay";
import {
  reportAtomCommandResult,
  settleAsyncResult,
  settlePromise,
  squashAtomCommandFailure,
} from "@vekrel/client-runtime/state/runtime";
import * as Effect from "effect/Effect";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { runtime } from "../../lib/runtime";
import { appAtomRegistry } from "../../state/atom-registry";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  getComposerCloudAccountId,
  restoreCloudComposerDrafts,
} from "../../state/use-composer-drafts";
import {
  releaseAgentAwarenessRelayTokenProvider,
  setAgentAwarenessRelayTokenProvider,
  unregisterAgentAwarenessDeviceForCurrentUser,
} from "../agent-awareness/remoteRegistration";
import { clearConnectOnboardingRequest, requestConnectOnboarding } from "./connectOnboarding";
import { resolveCloudPublicConfig } from "./publicConfig";
import { removeCloudMachines } from "./cloud-drafts";
import {
  type CloudAccount,
  clearStoredAccount,
  readStoredAccount,
  refreshTokenStore,
  signInWithBrowser,
  signOutAccount,
} from "./accountSession";

export interface CloudAuthState {
  readonly isLoaded: boolean;
  readonly isSignedIn: boolean;
  readonly userId: string | null;
  readonly email: string | null;
  /** A relay access token for the signed-in account; `null` when signed out. */
  readonly getToken: () => Promise<string | null>;
  /** Opens the relay sign-in page in the system browser. */
  readonly signIn: () => Promise<void>;
  readonly signOut: () => Promise<void>;
}

// Without cloud config no provider is mounted: signed out, never loaded.
const CloudAuthContext = createContext<CloudAuthState>({
  isLoaded: false,
  isSignedIn: false,
  userId: null,
  email: null,
  getToken: async () => null,
  signIn: async () => {},
  signOut: async () => {},
});

export function useCloudAuth(): CloudAuthState {
  return useContext(CloudAuthContext);
}

function resetManagedRelayTokenCache() {
  return settleAsyncResult(() =>
    runtime.runPromiseExit(
      ManagedRelay.ManagedRelayClient.pipe(Effect.flatMap((client) => client.resetTokenCache)),
    ),
  );
}

export function deactivateCloudRelayAccount(): void {
  setAgentAwarenessRelayTokenProvider(null);
  setManagedRelaySession(appAtomRegistry, null);
}

export function activateCloudRelayAccount(
  accountId: string,
  tokenProvider: () => Promise<string | null>,
): void {
  setAgentAwarenessRelayTokenProvider(tokenProvider, accountId);
  setManagedRelaySession(appAtomRegistry, {
    accountId,
    readToken: tokenProvider,
  });
}

function CloudAuthBridge(props: { readonly children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn, userId } = useCloudAuth();
  const removeRelayMachines = useAtomCommand(removeCloudMachines, {
    reportFailure: false,
    reportDefect: false,
  });
  const previousTokenProviderRef = useRef<{
    readonly userId: string;
    readonly provider: () => Promise<string | null>;
  } | null>(null);
  const observedAccountRef = useRef<string | null | undefined>(undefined);
  const accountTransitionRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isLoaded) {
      return;
    }

    const previousObservedAccount = observedAccountRef.current;
    const nextAccount = isSignedIn && userId ? userId : null;
    observedAccountRef.current = nextAccount;

    // The request itself is issued after the cleanup transition inside
    // activateSession, so the sheet never lists the previous account's
    // machines; sign-out drops any not-yet-presented request instead.
    const isAccountTransition =
      previousObservedAccount !== undefined && previousObservedAccount !== nextAccount;
    if (isAccountTransition && nextAccount === null) {
      clearConnectOnboardingRequest();
    }

    const cleanUpAccount = async (
      previous: {
        readonly userId: string;
        readonly provider: () => Promise<string | null>;
      } | null,
      accountId: string | null,
    ) => {
      const removal = await removeRelayMachines(accountId);
      if (removal._tag !== "Success") throw squashAtomCommandFailure(removal);
      const cleanup = [
        resetManagedRelayTokenCache(),
        ...(previous
          ? [
              settleAsyncResult(() =>
                runtime.runPromiseExit(
                  unregisterAgentAwarenessDeviceForCurrentUser(previous.provider),
                ),
              ),
            ]
          : []),
      ];
      const results = await Promise.all(cleanup);
      for (const result of results) {
        reportAtomCommandResult(result, { label: "cloud account cleanup" });
      }
    };
    const queueAccountCleanup = (previous: typeof previousTokenProviderRef.current) => {
      const previousTransition = accountTransitionRef.current ?? Promise.resolve();
      accountTransitionRef.current = previousTransition
        .catch(() => {})
        .then(() => cleanUpAccount(previous, previousObservedAccount ?? null));
      return accountTransitionRef.current;
    };

    if (!isSignedIn || !userId) {
      const previous = previousTokenProviderRef.current;
      previousTokenProviderRef.current = null;
      deactivateCloudRelayAccount();
      if (previousObservedAccount !== null) {
        void settlePromise(() => queueAccountCleanup(previous)).then((result) => {
          reportAtomCommandResult(result, { label: "cloud account cleanup" });
        });
      }
      return;
    }

    const previous = previousTokenProviderRef.current;
    const tokenProvider = getToken;
    const activateSession = () => {
      if (cancelled) {
        return;
      }
      previousTokenProviderRef.current = { userId, provider: tokenProvider };
      activateCloudRelayAccount(userId, tokenProvider);
      if (isAccountTransition) {
        requestConnectOnboarding(userId);
      }
    };
    const activateAfterTransition = (transition: Promise<void>) => {
      const activation = (async () => {
        await transition;
        if (cancelled) return;
        const storedAccount = await getComposerCloudAccountId();
        if (storedAccount !== null && storedAccount !== userId) {
          await cleanUpAccount(null, storedAccount);
        }
        if (cancelled) return;
        await restoreCloudComposerDrafts(userId);
        activateSession();
      })();
      accountTransitionRef.current = activation;
      void settlePromise(() => activation).then((result) => {
        reportAtomCommandResult(result, { label: "cloud account activation" });
      });
    };
    if (
      previousObservedAccount !== undefined &&
      previousObservedAccount !== null &&
      previousObservedAccount !== userId
    ) {
      previousTokenProviderRef.current = null;
      deactivateCloudRelayAccount();
      activateAfterTransition(queueAccountCleanup(previous));
    } else {
      activateAfterTransition((accountTransitionRef.current ?? Promise.resolve()).catch(() => {}));
    }

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, removeRelayMachines, userId]);

  useEffect(
    () => () => {
      previousTokenProviderRef.current = null;
      // Unmounting is not a sign-out: the user is usually still signed in, so
      // detach the provider without ending lock-screen activities or wiping the
      // persisted registration (a remount reuses both).
      releaseAgentAwarenessRelayTokenProvider();
      setManagedRelaySession(appAtomRegistry, null);
    },
    [],
  );

  return props.children;
}

function AccountSessionProvider(props: {
  readonly relayUrl: string;
  readonly children: ReactNode;
}) {
  const { relayUrl } = props;
  // `undefined` until the stored account is read.
  const [account, setAccount] = useState<CloudAccount | null | undefined>(undefined);
  const session = useMemo(
    () =>
      createAccountSession({
        relayUrl,
        clientId: AccountClientId.mobile,
        store: refreshTokenStore,
        // The relay refused the refresh token (revoked, reused, account disabled).
        onSignedOut: () => {
          setAccount(null);
          void clearStoredAccount().catch(() => {});
        },
      }),
    [relayUrl],
  );

  useEffect(() => {
    let cancelled = false;
    void readStoredAccount()
      .catch(() => null)
      .then((stored) => {
        if (!cancelled) setAccount((current) => (current === undefined ? stored : current));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<CloudAuthState>(
    () => ({
      isLoaded: account !== undefined,
      isSignedIn: Boolean(account),
      userId: account?.userId ?? null,
      email: account?.email ?? null,
      getToken: session.getAccessToken,
      signIn: async () => {
        const next = await signInWithBrowser(session, relayUrl);
        if (next) setAccount(next);
      },
      signOut: () =>
        signOutAccount(session, (tokenProvider) =>
          runtime.runPromise(unregisterAgentAwarenessDeviceForCurrentUser(tokenProvider)),
        ).finally(() => {
          setAccount(null);
          return clearStoredAccount();
        }),
    }),
    [account, relayUrl, session],
  );

  return <CloudAuthContext.Provider value={value}>{props.children}</CloudAuthContext.Provider>;
}

export function CloudAuthProvider(props: { readonly children: ReactNode }) {
  const relayUrl = resolveCloudPublicConfig().relay.url;

  useEffect(() => {
    if (!relayUrl) {
      deactivateCloudRelayAccount();
    }
  }, [relayUrl]);

  if (!relayUrl) {
    return props.children;
  }

  return (
    <AccountSessionProvider relayUrl={relayUrl}>
      <CloudAuthBridge>{props.children}</CloudAuthBridge>
    </AccountSessionProvider>
  );
}
