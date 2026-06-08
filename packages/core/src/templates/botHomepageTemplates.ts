export const DEFAULT_BOT_HOMEPAGE_TEMPLATE_ID = 'document';

export type BotHomepageTemplateId = 'document' | 'compact-list';

export interface BotHomepageTemplateDefinition {
  id: BotHomepageTemplateId;
  name: string;
  description: string;
  previewImage: string;
}

export const BOT_HOMEPAGE_TEMPLATES: readonly BotHomepageTemplateDefinition[] = [
  {
    id: 'document',
    name: 'Document',
    description: 'A profile-first page with overview, services, and recent activity sections.',
    previewImage: 'builtin://bot-homepage/document/preview.svg',
  },
  {
    id: 'compact-list',
    name: 'Compact List',
    description: 'A dense list layout for quickly scanning services, skills, buzz, and future homepage lists.',
    previewImage: 'builtin://bot-homepage/compact-list/preview.svg',
  },
];

export function isBotHomepageTemplateId(value: unknown): value is BotHomepageTemplateId {
  return BOT_HOMEPAGE_TEMPLATES.some((template) => template.id === value);
}

export function normalizeBotHomepageTemplateId(
  value: unknown,
  fallback: BotHomepageTemplateId = DEFAULT_BOT_HOMEPAGE_TEMPLATE_ID,
): BotHomepageTemplateId {
  return isBotHomepageTemplateId(value) ? value : fallback;
}
