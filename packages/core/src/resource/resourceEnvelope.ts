import type {
  BrowserResourceEnvelope,
  BrowserResourceSection,
  BrowserTrustedActionDescriptor,
} from '@openagentinternet/agent-browser-host-contract';

export function normalizeResourceSections(value: unknown): BrowserResourceSection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((section): BrowserResourceSection[] => {
    if (!section || typeof section !== 'object') return [];
    const raw = section as Record<string, unknown>;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
    const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : '';
    const kind = typeof raw.kind === 'string' && raw.kind.trim() ? raw.kind.trim() : 'generic-list';
    const items = Array.isArray(raw.items)
      ? raw.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      : [];
    if (!id || !title) return [];
    return [{
      id,
      title,
      kind: isResourceSectionKind(kind) ? kind : 'generic-list',
      items,
    }];
  });
}

export function normalizeTrustedActions(value: unknown): BrowserTrustedActionDescriptor[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((action): BrowserTrustedActionDescriptor[] => {
    if (!action || typeof action !== 'object') return [];
    const raw = action as Record<string, unknown>;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
    const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : '';
    const kind = typeof raw.kind === 'string' && raw.kind.trim() ? raw.kind.trim() : '';
    if (!id || !label || !isTrustedActionKind(kind)) return [];
    return [{
      id,
      label,
      kind,
      enabled: raw.enabled !== false,
      ...(raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload) ? { payload: raw.payload as Record<string, unknown> } : {}),
    }];
  });
}

export function createUnsupportedResourceEnvelope(uri: string, message: string): BrowserResourceEnvelope {
  return {
    uri,
    normalizedUri: uri,
    resourceType: 'unknown',
    title: 'Unsupported resource',
    renderer: {
      type: 'unsupported',
      contentType: 'text/plain',
      error: message,
    },
    actions: [],
    sections: [],
  };
}

function isResourceSectionKind(value: string): value is BrowserResourceSection['kind'] {
  return ['services', 'skills', 'buses', 'buzzes', 'apps', 'activity', 'generic-list'].includes(value);
}

function isTrustedActionKind(value: string): value is BrowserTrustedActionDescriptor['kind'] {
  return [
    'private-chat',
    'service-call',
    'copy-uri',
    'open-settings',
    'login',
    'wallet-sign',
    'payment',
    'edit-profile',
    'configure-chat',
    'view-messages',
    'share-resource',
  ].includes(value);
}
