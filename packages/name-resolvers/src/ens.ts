import {
  OPEN_AGENT_INTERNET_ENS_TEXT_KEY,
  browserCommandFailed,
  browserCommandSuccess,
  isSupportedNameAliasId,
  type BrowserCommandResult,
  type BrowserNameAliasProvider,
  type BrowserNameAliasRequest,
  type BrowserNameAliasResult,
} from '@openagentinternet/agent-browser-core';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';

export interface EnsTextClient {
  getEnsText(input: { name: string; key: string }): Promise<string | null>;
}

export interface CreateEnsOpenAgentInternetResolverInput {
  rpcUrls: string[];
  chainId?: 1;
  textKey?: string;
  now?: () => number;
  transportFactory?: (rpcUrl: string) => EnsTextClient;
}

function normalizeRpcUrls(value: string[]): string[] {
  return value.map((item) => item.trim()).filter(Boolean);
}

function createDefaultClient(rpcUrl: string): EnsTextClient {
  return createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });
}

export function createEnsOpenAgentInternetResolver(
  input: CreateEnsOpenAgentInternetResolverInput,
): BrowserNameAliasProvider {
  const rpcUrls = normalizeRpcUrls(input.rpcUrls);
  const textKey = input.textKey?.trim() || OPEN_AGENT_INTERNET_ENS_TEXT_KEY;
  const now = input.now ?? Date.now;
  const transportFactory = input.transportFactory ?? createDefaultClient;

  return {
    id: 'ens',
    supportsName(name: string): boolean {
      return isSupportedNameAliasId(name);
    },
    async resolveNameAlias(request: BrowserNameAliasRequest): Promise<BrowserCommandResult<BrowserNameAliasResult>> {
      let normalizedName: string;
      try {
        normalizedName = normalize(request.name);
      } catch (error) {
        return browserCommandFailed('name_resolution_failed', error instanceof Error ? error.message : 'ENS name normalization failed.', {
          aliasName: request.name,
        });
      }

      if (rpcUrls.length === 0) {
        return browserCommandFailed('name_resolution_unavailable', 'ENS RPC URLs are not configured.', {
          aliasName: normalizedName,
          textKey,
        });
      }

      const errors: string[] = [];
      for (const rpcUrl of rpcUrls) {
        try {
          const client = transportFactory(rpcUrl);
          const textValue = await client.getEnsText({ name: normalizedName, key: textKey });
          const canonicalUri = typeof textValue === 'string' ? textValue.trim() : '';
          if (canonicalUri) {
            return browserCommandSuccess({
              provider: 'ens',
              normalizedName,
              textKey,
              canonicalUri,
              resolvedAt: now(),
              verificationState: 'partial',
              raw: { rpcUrl },
            });
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }

      if (errors.length === rpcUrls.length) {
        return browserCommandFailed('name_resolution_failed', 'ENS text record lookup failed.', {
          aliasName: normalizedName,
          textKey,
          errors,
        });
      }

      return browserCommandFailed('name_alias_not_found', 'ENS text record was missing or empty.', {
        aliasName: normalizedName,
        textKey,
      });
    },
  };
}
