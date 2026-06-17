import type {
  BrowserProofSummary,
  BrowserResolveResult,
  BrowserTrustedAction,
  BrowserVerificationState,
} from './types.js';
import { normalizeBotHomepageTemplateId } from './botHomepageTemplates.js';
import { buildMetafileContentUrl } from './metafileContentUrl.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function recordField(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  return isRecord(value) ? value : {};
}

function recordListField(source: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const value = source[key];
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => isRecord(item))
    : [];
}

function stringField(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === 'string' ? value.trim() : '';
}

function numberField(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function verificationState(value: unknown): BrowserVerificationState {
  return value === 'verified' || value === 'partial' || value === 'unverified'
    ? value
    : 'unverified';
}

function isV3Homepage(homepage: Record<string, unknown>): boolean {
  return stringField(homepage, 'schemaVersion') === 'botHomepage.v3';
}

function shortGlobalMetaId(globalMetaId: string): string {
  if (globalMetaId.length <= 14) {
    return globalMetaId;
  }
  return `${globalMetaId.slice(0, 8)}...${globalMetaId.slice(-4)}`;
}

function onlineState(value: unknown): boolean | null {
  if (!isRecord(value)) {
    return null;
  }
  const state = stringField(value, 'state').toLowerCase();
  if (state === 'online') {
    return true;
  }
  if (state === 'offline') {
    return false;
  }
  return null;
}

function avatarFromProfile(profile: Record<string, unknown>, metafileContentBaseUrl: unknown): string | undefined {
  const rawAvatar = profile.avatar;
  if (typeof rawAvatar === 'string') {
    return rawAvatar.trim() || undefined;
  }
  if (!isRecord(rawAvatar)) {
    return undefined;
  }
  const directUrl = stringField(rawAvatar, 'url');
  if (directUrl) {
    return directUrl;
  }
  const pinId = stringField(rawAvatar, 'pinId') || stringField(rawAvatar, 'id');
  return pinId ? buildMetafileContentUrl(metafileContentBaseUrl, pinId) : undefined;
}

function v3HasProvenance(homepage: Record<string, unknown>): boolean {
  const profile = recordField(homepage, 'profile');
  const pins = recordField(profile, 'pins');
  if (Object.values(pins).some((value) => typeof value === 'string' && value.trim())) {
    return true;
  }
  if (stringField(recordField(profile, 'avatar'), 'pinId')) {
    return true;
  }
  if (stringField(recordField(profile, 'homepage'), 'pinId')) {
    return true;
  }
  for (const section of recordListField(homepage, 'sections')) {
    for (const item of recordListField(section, 'items')) {
      if (stringField(item, 'pinId')) {
        return true;
      }
    }
  }
  return false;
}

function resolveHomepageVerificationState(
  homepage: Record<string, unknown>,
  proofs: Record<string, unknown>,
): BrowserVerificationState {
  const state = verificationState(proofs.verificationState);
  if (state !== 'unverified') {
    return state;
  }
  return isV3Homepage(homepage) && v3HasProvenance(homepage) ? 'partial' : 'unverified';
}

function proofSummary(value: unknown, fallbackState: BrowserVerificationState): BrowserProofSummary | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const summary: BrowserProofSummary = {
    verificationState: verificationState(value.verificationState) === 'unverified'
      ? fallbackState
      : verificationState(value.verificationState),
  };
  const txid = stringField(value, 'txid');
  const pinId = stringField(value, 'pinId');
  const protocolPath = stringField(value, 'protocolPath');
  const contentHash = stringField(value, 'contentHash');
  const publisherGlobalMetaId = stringField(value, 'publisherGlobalMetaId');
  if (txid) summary.txid = txid;
  if (pinId) summary.pinId = pinId;
  if (protocolPath) summary.protocolPath = protocolPath;
  if (contentHash) summary.contentHash = contentHash;
  if (publisherGlobalMetaId) summary.publisherGlobalMetaId = publisherGlobalMetaId;
  summary.details = value;
  return summary;
}

function pickProof(homepage: Record<string, unknown>, state: BrowserVerificationState): BrowserProofSummary | undefined {
  const proofs = recordField(homepage, 'proofs');
  const identity = proofSummary(proofs.identity, state);
  if (identity) {
    return identity;
  }

  const profileProofs = Array.isArray(proofs.profile) ? proofs.profile : [];
  for (const candidate of profileProofs) {
    const summary = proofSummary(candidate, state);
    if (summary) {
      return summary;
    }
  }

  const services = Array.isArray(homepage.services) ? homepage.services : [];
  for (const service of services) {
    if (!isRecord(service)) {
      continue;
    }
    const summary = proofSummary(service.proof, state);
    if (summary) {
      return summary;
    }
  }

  return undefined;
}

function v3ProofSummary(input: {
  pinId: string;
  protocolPath?: string;
  publisherGlobalMetaId: string;
  verificationState: BrowserVerificationState;
  details: Record<string, unknown>;
}): BrowserProofSummary {
  return {
    pinId: input.pinId,
    protocolPath: input.protocolPath,
    publisherGlobalMetaId: input.publisherGlobalMetaId || undefined,
    verificationState: input.verificationState,
    details: input.details,
  };
}

function pickV3Proof(
  homepage: Record<string, unknown>,
  globalMetaId: string,
  state: BrowserVerificationState,
): BrowserProofSummary | undefined {
  const profile = recordField(homepage, 'profile');
  const pins = recordField(profile, 'pins');
  const profilePins: Array<[string, string]> = [
    ['name', '/info/name'],
    ['bio', '/info/bio'],
    ['chatPubkey', '/info/chatpubkey'],
  ];
  for (const [key, protocolPath] of profilePins) {
    const pinId = stringField(pins, key);
    if (pinId) {
      return v3ProofSummary({
        pinId,
        protocolPath,
        publisherGlobalMetaId: globalMetaId,
        verificationState: state,
        details: { source: `profile.pins.${key}` },
      });
    }
  }

  const avatar = recordField(profile, 'avatar');
  const avatarPinId = stringField(avatar, 'pinId');
  if (avatarPinId) {
    return v3ProofSummary({
      pinId: avatarPinId,
      protocolPath: '/info/avatar',
      publisherGlobalMetaId: globalMetaId,
      verificationState: state,
      details: { source: 'profile.avatar', avatar },
    });
  }

  const homepageInfo = recordField(profile, 'homepage');
  const homepagePinId = stringField(homepageInfo, 'pinId');
  if (homepagePinId) {
    return v3ProofSummary({
      pinId: homepagePinId,
      protocolPath: '/info/homepage',
      publisherGlobalMetaId: globalMetaId,
      verificationState: state,
      details: { source: 'profile.homepage', homepage: homepageInfo },
    });
  }

  for (const section of recordListField(homepage, 'sections')) {
    for (const item of recordListField(section, 'items')) {
      const pinId = stringField(item, 'pinId');
      if (!pinId) {
        continue;
      }
      return v3ProofSummary({
        pinId,
        protocolPath: stringField(item, 'protocolPath') || undefined,
        publisherGlobalMetaId: globalMetaId,
        verificationState: state,
        details: {
          source: 'sections.items',
          sectionId: stringField(section, 'id') || undefined,
          item,
        },
      });
    }
  }
  return undefined;
}

function normalizeAction(value: unknown): BrowserTrustedAction | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = stringField(value, 'id');
  const label = stringField(value, 'label');
  const kind = stringField(value, 'kind') as BrowserTrustedAction['kind'];
  if (!id || !label || !['private-chat', 'service-list', 'service-call', 'copy', 'proof', 'creator'].includes(kind)) {
    return null;
  }

  const action: BrowserTrustedAction = { id, label, kind };
  if (typeof value.enabled === 'boolean') action.enabled = value.enabled;
  if (typeof value.requiresUsingIdentity === 'boolean') action.requiresUsingIdentity = value.requiresUsingIdentity;
  const uri = stringField(value, 'uri');
  const serviceId = stringField(value, 'serviceId');
  if (uri) action.uri = uri;
  if (serviceId) action.serviceId = serviceId;
  if (isRecord(value.payload)) action.payload = value.payload;
  return action;
}

function mergeActions(rawActions: unknown, normalizedUri: string): BrowserTrustedAction[] {
  const actions = new Map<string, BrowserTrustedAction>();
  const homepageActions = Array.isArray(rawActions) ? rawActions : [];
  for (const rawAction of homepageActions) {
    const action = normalizeAction(rawAction);
    if (action) {
      actions.set(action.id, action);
    }
  }

  for (const action of [
    { id: 'message', label: 'Message', kind: 'private-chat' as const, enabled: true, requiresUsingIdentity: true },
    { id: 'services', label: 'Services', kind: 'service-list' as const, enabled: true, requiresUsingIdentity: true },
    { id: 'copy-uri', label: 'Copy URI', kind: 'copy' as const, enabled: true, uri: normalizedUri },
  ]) {
    if (!actions.has(action.id)) {
      actions.set(action.id, action);
    }
  }

  return [...actions.values()];
}

export function buildBotPageResolveResult(input: {
  uri: string;
  normalizedUri: string;
  homepage: Record<string, unknown>;
  resolverUrl: string;
  templateId?: unknown;
  metafileContentBaseUrl?: unknown;
}): BrowserResolveResult {
  const canonical = recordField(input.homepage, 'canonical');
  const identity = recordField(input.homepage, 'identity');
  const profile = recordField(input.homepage, 'profile');
  const homepageInfo = recordField(input.homepage, 'homepage');
  const proofs = recordField(input.homepage, 'proofs');
  const source = recordField(input.homepage, 'source');
  const globalMetaId = stringField(identity, 'globalMetaId')
    || stringField(input.homepage, 'globalMetaId')
    || stringField(canonical, 'globalMetaId');
  const state = resolveHomepageVerificationState(input.homepage, proofs);
  const title = stringField(profile, 'name')
    || stringField(homepageInfo, 'title')
    || stringField(identity, 'display')
    || shortGlobalMetaId(globalMetaId);

  return {
    uri: input.uri,
    normalizedUri: input.normalizedUri,
    resourceType: 'bot',
    title,
    owner: {
      kind: 'bot',
      globalMetaId,
      metaid: stringField(identity, 'legacyMetaId') || stringField(canonical, 'metaid') || undefined,
      address: stringField(canonical, 'address') || undefined,
      name: title,
      avatar: avatarFromProfile(profile, input.metafileContentBaseUrl),
      online: onlineState(input.homepage.presence),
      verificationState: state,
    },
    renderer: {
      type: 'bot-page',
      contentType: 'application/vnd.oac.bot-homepage+json',
      templateId: normalizeBotHomepageTemplateId(input.templateId),
      data: input.homepage,
    },
    status: {
      state: 'resolved',
      verificationState: state,
      message: 'Bot Page resolved.',
    },
    proof: isV3Homepage(input.homepage)
      ? pickV3Proof(input.homepage, globalMetaId, state) ?? pickProof(input.homepage, state)
      : pickProof(input.homepage, state),
    source: {
      resolver: stringField(source, 'resolver') || 'metaso-p2p',
      url: input.resolverUrl,
      fetchedAt: numberField(source, 'fetchedAt'),
      stale: typeof source.stale === 'boolean' ? source.stale : undefined,
      schemaVersion: stringField(input.homepage, 'schemaVersion') || undefined,
      raw: input.homepage,
    },
    actions: mergeActions(input.homepage.actions, input.normalizedUri),
  };
}
