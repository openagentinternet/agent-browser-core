/**
 * MetaApp launch context: parse and serialize the query parameters and
 * fragment of a `metaapp://<appPinId>?<query>#<hash>` deep link.
 *
 * Hosts parse the URI to obtain a pure appPinId (used only to resolve the
 * MetaApp package) plus a launch context. The full deep-link query and hash
 * are forwarded to the app by appending them to the app entry URL, so the app
 * reads the same location.search / location.hash the URI carried; the
 * declared `view` / `pin` parameters additionally follow the metaapp_buzz
 * launch contract below.
 */

export interface MetaAppLaunchContext {
  /** Declared page view. Absent when the deep link carries no `view`. */
  view?: string;
  /** Resource pinId targeted by the view. Absent when the deep link carries no `pin`. */
  pin?: string;
  /** Verbatim deep-link query without the leading `?` (view/pin plus any extra parameters). */
  rawQuery?: string;
  /** Verbatim deep-link fragment without the leading `#`. */
  rawHash?: string;
  /** The complete original deep-link URI as the user entered it. */
  originalUri: string;
}

export interface MetaAppLaunchParseResult {
  /** Pure app pinId (never contains query/path/hash fragments). */
  appPinId: string;
  /**
   * Launch context, or null when the URI carries neither a query nor a
   * fragment. The context is present (possibly without view/pin) whenever
   * the deep link carries parameters or a fragment that must reach the app.
   */
  launchContext: MetaAppLaunchContext | null;
}

// Declared MetaApp launch views, as documented by the metaapp_buzz app
// contract. Hosts forward the full deep-link query and hash; `view`/`pin`
// decide whether a launch target is forwarded at all, and the app decides
// how to render it.
const DECLARED_METAAPP_VIEWS = new Set(['buzz']);

const METAAPP_ID_PREFIX = /^([^/?#]*)/u;

export function parseMetaAppLaunchUri(input: string): MetaAppLaunchParseResult {
  const originalUri = String(input ?? '').trim();
  const schemeMatch = originalUri.match(/^metaapp:\/\/(.*)$/iu);
  const rest = schemeMatch ? schemeMatch[1] : originalUri;

  const appPinId = METAAPP_ID_PREFIX.exec(rest)?.[1] ?? '';

  const queryIndex = rest.indexOf('?');
  const hashIndex = rest.indexOf('#');
  const queryStart = queryIndex === -1 ? -1 : queryIndex + 1;
  // A '#' before the '?' puts the query inside the fragment: `pin#f?view=x`
  // carries no real query, and everything after '#' stays fragment-verbatim.
  const hashBeforeQuery = hashIndex !== -1 && (queryStart === -1 || hashIndex < queryStart - 1);
  const rawQuery = queryStart !== -1 && !hashBeforeQuery
    ? rest.slice(queryStart, hashIndex !== -1 ? hashIndex : rest.length)
    : '';
  const rawHash = hashIndex !== -1 ? rest.slice(hashIndex + 1) : '';

  if (!rawQuery && !rawHash) {
    return { appPinId, launchContext: null };
  }
  const params = new URLSearchParams(rawQuery);
  const view = params.get('view') ?? '';
  const pin = params.get('pin') ?? '';
  return {
    appPinId,
    launchContext: {
      ...(view ? { view } : {}),
      ...(pin ? { pin } : {}),
      rawQuery,
      rawHash,
      originalUri,
    },
  };
}

function serializeDeclaredLaunchParams(view: string, pin: string): string {
  if (!view) {
    return '';
  }
  const params = new URLSearchParams();
  if (DECLARED_METAAPP_VIEWS.has(view)) {
    if (!pin) {
      return '';
    }
    params.set('view', view);
    params.set('pin', pin);
    return params.toString();
  }
  params.set('view', view);
  if (pin) {
    params.set('pin', pin);
  }
  return params.toString();
}

/**
 * Serialize the launch context into the query string appended to the app
 * entry URL. Every deep-link parameter is forwarded so the app reads the same
 * location.search as the original URI: when the launch rules allow
 * `view`/`pin`, the raw query is forwarded byte-exact; otherwise the raw
 * query is forwarded with `view`/`pin` stripped. Contexts without a raw query
 * (built programmatically by hosts) fall back to serializing only the
 * declared parameters, encodeURIComponent-encoded via URLSearchParams.
 *
 * Degradation rules (host side, per the metaapp_buzz requirements):
 * - no `view`: forward the remaining parameters without `view`/`pin`, so the
 *   app opens its feed;
 * - `view` is a declared value but `pin` is missing: same (the app keeps its
 *   own invalid-link handling for the parameters it receives in-app);
 * - `view` is not a declared value: forward it verbatim so the app can render
 *   its "unsupported view" state.
 */
export function serializeMetaAppLaunchQuery(context: MetaAppLaunchContext | null | undefined): string {
  if (!context) {
    return '';
  }
  const view = typeof context.view === 'string' ? context.view : '';
  const pin = typeof context.pin === 'string' ? context.pin : '';
  const rawQuery = typeof context.rawQuery === 'string' ? context.rawQuery : '';
  const declaredQuery = serializeDeclaredLaunchParams(view, pin);
  if (!rawQuery) {
    return declaredQuery;
  }

  const rawParams = new URLSearchParams(rawQuery);
  const rawCarriesLaunch = view !== ''
    && rawParams.get('view') === view
    && (!pin || rawParams.get('pin') === pin);
  if (declaredQuery && rawCarriesLaunch) {
    return rawQuery;
  }

  rawParams.delete('view');
  rawParams.delete('pin');
  const extraQuery = rawParams.toString();
  if (!declaredQuery) {
    return extraQuery;
  }
  return extraQuery ? `${extraQuery}&${declaredQuery}` : declaredQuery;
}

/**
 * Serialize the launch context fragment for the app entry URL, verbatim
 * without the leading `#`. Empty when the deep link carried no fragment.
 */
export function serializeMetaAppLaunchHash(context: MetaAppLaunchContext | null | undefined): string {
  return context && typeof context.rawHash === 'string' ? context.rawHash : '';
}
