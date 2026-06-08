import type {
  BrowserResourceEnvelope,
  BrowserResourceSection,
  BrowserTrustedActionDescriptor,
} from '@openagentinternet/agent-browser-host-contract';
import {
  DEFAULT_BOT_HOMEPAGE_TEMPLATE_ID,
  normalizeBotHomepageTemplateId,
  type BotHomepageTemplateId,
} from '../templates/botHomepageTemplates.js';

export interface BuildBotHomepageEnvelopeInput {
  uri: string;
  normalizedUri: string;
  homepage: Record<string, unknown>;
  resolverUrl?: string;
  templateId?: string;
  fetchedAt?: number;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function list(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function displayTitle(item: Record<string, unknown>): string {
  return text(item.displayName) || text(item.name) || text(item.title) || text(item.id) || text(item.currentPinId) || 'Untitled';
}

function normalizeItems(items: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return items.map((item) => ({
    ...item,
    title: displayTitle(item),
    description: text(item.description) || text(item.summary) || text(item.bio),
  }));
}

function section(
  id: string,
  title: string,
  kind: BrowserResourceSection['kind'],
  items: Array<Record<string, unknown>>,
): BrowserResourceSection | null {
  if (items.length === 0) return null;
  return {
    id,
    title,
    kind,
    items: normalizeItems(items),
  };
}

function sectionsFromHomepage(homepage: Record<string, unknown>): BrowserResourceSection[] {
  return [
    section('overview', 'Overview', 'generic-list', list(homepage.homepage).length ? list(homepage.homepage) : [record(homepage.homepage)].filter((item) => Object.keys(item).length > 0)),
    section('services', 'Services', 'services', list(homepage.services)),
    section('skills', 'Skills', 'skills', list(homepage.skills)),
    section('buses', 'Buses', 'buses', list(homepage.buses)),
    section('buzzes', 'Buzz', 'buzzes', list(homepage.buzzes).length ? list(homepage.buzzes) : list(homepage.buzz)),
    section('apps', 'Apps', 'apps', list(homepage.apps)),
    section('activity', 'Recent Activity', 'activity', list(homepage.activity)),
  ].filter((item): item is BrowserResourceSection => Boolean(item));
}

function actionsFromHomepage(globalMetaId: string, homepage: Record<string, unknown>): BrowserTrustedActionDescriptor[] {
  const actions: BrowserTrustedActionDescriptor[] = [];
  if (globalMetaId) {
    actions.push({
      id: 'private-chat',
      label: 'Private Chat',
      kind: 'private-chat',
      enabled: true,
      payload: { globalMetaId },
    });
  }
  for (const service of list(homepage.services)) {
    const serviceId = text(service.currentPinId) || text(service.id);
    if (!serviceId) continue;
    actions.push({
      id: `service-call:${serviceId}`,
      label: displayTitle(service),
      kind: 'service-call',
      enabled: true,
      payload: {
        serviceId,
        providerGlobalMetaId: globalMetaId,
      },
    });
  }
  return actions;
}

export function buildBotHomepageEnvelope(input: BuildBotHomepageEnvelopeInput): BrowserResourceEnvelope {
  const profile = record(input.homepage.profile);
  const globalMetaId = text(input.homepage.globalMetaId) || text(profile.globalMetaId);
  const title = text(profile.name) || text(input.homepage.name) || globalMetaId || 'Bot';
  const templateId: BotHomepageTemplateId = normalizeBotHomepageTemplateId(
    input.templateId,
    DEFAULT_BOT_HOMEPAGE_TEMPLATE_ID,
  );

  return {
    uri: input.uri,
    normalizedUri: input.normalizedUri,
    resourceType: 'bot',
    title,
    owner: {
      kind: 'bot',
      globalMetaId,
      address: text(profile.address) || undefined,
      label: title,
      avatar: text(profile.avatar) || undefined,
      verificationState: 'partial',
    },
    ownerAffinity: null,
    renderer: {
      type: 'bot-page',
      contentType: 'application/vnd.agent-browser.bot-homepage+json',
      templateId,
      data: input.homepage,
    },
    actions: actionsFromHomepage(globalMetaId, input.homepage),
    sections: sectionsFromHomepage(input.homepage),
    status: {
      state: 'resolved',
      verificationState: 'partial',
      message: '',
    },
    proof: {
      txid: text(record(input.homepage.identity).txid) || undefined,
      pinId: text(record(input.homepage.identity).pinId) || undefined,
      publisherGlobalMetaId: globalMetaId || undefined,
      verificationState: 'partial',
    },
    source: {
      resolver: 'bot-homepage',
      url: input.resolverUrl,
      fetchedAt: input.fetchedAt,
      schemaVersion: text(input.homepage.schemaVersion) || 'botHomepage.v1',
      raw: input.homepage,
    },
    raw: input.homepage,
  };
}
