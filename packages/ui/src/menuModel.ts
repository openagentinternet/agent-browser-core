import { BOT_HOMEPAGE_TEMPLATES } from '@openagentinternet/agent-browser-core';

export interface BrowserSettingsTab {
  id: 'baseUrls' | 'templates' | 'cache';
  label: string;
}

export interface BrowserMenuItem {
  id: string;
  label: string;
  icon: 'settings' | 'template' | 'database' | 'info';
  action: 'open-settings' | 'toggle-inspector' | 'toggle-drawer';
  settingsTab?: BrowserSettingsTab['id'];
}

export interface BrowserMenuSection {
  id: string;
  title: string;
  items: BrowserMenuItem[];
}

export interface BrowserBaseUrlFieldDefinition {
  key: string;
  label: string;
  placeholder: string;
}

export type BrowserMenuItemDefinition = BrowserMenuItem;
export type BrowserMenuSectionDefinition = BrowserMenuSection;
export type BrowserSettingsTabDefinition = BrowserSettingsTab;

export const BROWSER_SETTINGS_TABS: BrowserSettingsTab[] = [
  { id: 'baseUrls', label: 'Base URLs' },
  { id: 'templates', label: 'Templates' },
  { id: 'cache', label: 'Cache' },
];

export const BROWSER_MENU_SECTIONS: BrowserMenuSection[] = [
  {
    id: 'browser',
    title: 'Browser',
    items: [
      { id: 'settings', label: 'Settings', icon: 'settings', action: 'open-settings', settingsTab: 'baseUrls' },
      { id: 'templates', label: 'Templates', icon: 'template', action: 'open-settings', settingsTab: 'templates' },
      { id: 'cache', label: 'Cache', icon: 'database', action: 'open-settings', settingsTab: 'cache' },
      { id: 'inspector', label: 'Inspector', icon: 'info', action: 'toggle-inspector' },
    ],
  },
];

export const BROWSER_BOT_HOMEPAGE_TEMPLATES = BOT_HOMEPAGE_TEMPLATES;

export const BROWSER_BASE_URL_FIELDS: readonly BrowserBaseUrlFieldDefinition[] = [
  { key: 'metasoP2PBaseUrl', label: 'Bot Homepage API Base URL', placeholder: 'https://so.metaid.io' },
  { key: 'metafileContentBaseUrl', label: 'Metafile Content Base URL', placeholder: 'https://file.metaid.io/metafile-indexer' },
  { key: 'manApiBaseUrl', label: 'ManAPI Base URL', placeholder: 'https://manapi.metaid.io' },
  { key: 'blockExplorerBaseUrl', label: 'Block Explorer Base URL', placeholder: 'https://www.mvcscan.com/tx' },
  { key: 'walletApiBaseUrl', label: 'Wallet API Base URL', placeholder: 'https://...' },
];
