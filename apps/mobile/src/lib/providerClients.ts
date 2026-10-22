import { isProviderDriverKind } from "@vekrel/contracts";
import { acpRegistryClient } from "@vekrel/provider-acp-registry/client";
import { makeProviderClientRegistry } from "@vekrel/provider-core/client";
import { cursorClient } from "@vekrel/provider-cursor/client";
import { grokClient } from "@vekrel/provider-grok/client";
import { museClient } from "@vekrel/provider-muse/client";
import { openCodeClient } from "@vekrel/provider-opencode/client";
import { piClient } from "@vekrel/provider-pi/client";

const providerClients = makeProviderClientRegistry([
  cursorClient,
  grokClient,
  museClient,
  openCodeClient,
  piClient,
  acpRegistryClient,
]);

export function getProviderClient(driver: string | null | undefined) {
  return isProviderDriverKind(driver) ? providerClients.get(driver) : undefined;
}
