import type { ParsedPreviewFileUri } from './types.js';
export type { ParsedPreviewFileUri } from './types.js';

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function collapseSlashes(value: string): string {
  return value.replace(/\/\/+/g, '/');
}

export function parsePreviewFileUri(input: string): ParsedPreviewFileUri {
  const originalUri = cleanText(input);
  let url: URL;
  try {
    url = new URL(originalUri);
  } catch {
    throw new Error('Enter a complete preview-file URI such as preview-file://localhost/path/to/file.md.');
  }
  if (url.protocol !== 'preview-file:') {
    throw new Error('Preview-File parser requires a preview-file:// URI.');
  }
  // Reject userinfo — meaningless for this scheme and a source of confusion.
  if (url.username || url.password) {
    throw new Error('Unsupported preview-file URI userinfo.');
  }

  const host = url.host; // includes port when present, so localhost:3000 never equals 'localhost'
  if (!host) {
    throw new Error('preview-file URI requires a host.');
  }
  if (host !== 'localhost') {
    throw new Error('preview-file only supports localhost.');
  }

  // url.pathname retains percent-encoding; decode it, then collapse stray duplicate slashes.
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    throw new Error('preview-file URI path contains an invalid percent-escape.');
  }
  const normalizedPath = collapseSlashes(decodedPath);
  if (!normalizedPath.startsWith('/')) {
    throw new Error('preview-file URI path must be absolute.');
  }

  const normalizedUri = `preview-file://${host}${normalizedPath}`;
  return {
    originalUri,
    normalizedUri,
    scheme: 'preview-file',
    host: 'localhost',
    path: normalizedPath,
  };
}

// file:///abs/path and file://localhost/abs/path are accepted as aliases and
// normalize to preview-file://localhost/abs/path. Windows drive paths keep the
// leading slash (file:///C:/x -> /C:/x); the host strips it on win32.
export function previewFileUriFromFileUri(input: string): string {
  const originalUri = cleanText(input);
  let url: URL;
  try {
    url = new URL(originalUri);
  } catch {
    throw new Error('Enter a complete file URI such as file:///path/to/file.md.');
  }
  if (url.protocol !== 'file:') {
    throw new Error('Preview-File parser requires a file:// URI.');
  }
  if (url.username || url.password) {
    throw new Error('Unsupported file URI userinfo.');
  }
  const host = url.host;
  if (host && host !== 'localhost') {
    throw new Error('preview-file only supports localhost.');
  }
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    throw new Error('file URI path contains an invalid percent-escape.');
  }
  const normalizedPath = collapseSlashes(decodedPath);
  if (!normalizedPath.startsWith('/')) {
    throw new Error('preview-file URI path must be absolute.');
  }
  return `preview-file://localhost${normalizedPath}`;
}
