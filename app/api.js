const API = 'https://make.fun/api';
const CACHE_PREFIX = 'makefun.api.v2:';
const MAX_CACHE_ENTRIES = 60;
const REQUEST_TIMEOUT = 15000;

const memory = new Map();
const inflight = new Map();

export class ApiError extends Error {
  constructor(message, { status = 0, cause } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    if (cause) this.cause = cause;
  }
}

function storage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function keyFor(url) {
  return `${CACHE_PREFIX}${url}`;
}

function readCache(url) {
  if (memory.has(url)) return memory.get(url);
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(keyFor(url));
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || !Object.hasOwn(saved, 'data')) return null;
    const entry = {
      data: saved.data,
      etag: typeof saved.etag === 'string' ? saved.etag : '',
      savedAt: Number(saved.savedAt) || 0,
    };
    memory.set(url, entry);
    return entry;
  } catch {
    try {
      store.removeItem(keyFor(url));
    } catch {}
    return null;
  }
}

function pruneStorage(store) {
  try {
    const entries = [];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (!key?.startsWith(CACHE_PREFIX)) continue;
      let savedAt = 0;
      try {
        savedAt = Number(JSON.parse(store.getItem(key) || '{}').savedAt) || 0;
      } catch {}
      entries.push({ key, savedAt });
    }
    if (entries.length <= MAX_CACHE_ENTRIES) return;
    entries
      .sort((left, right) => left.savedAt - right.savedAt)
      .slice(0, entries.length - MAX_CACHE_ENTRIES)
      .forEach(({ key }) => store.removeItem(key));
  } catch {}
}

function writeCache(url, data, etag) {
  const entry = { data, etag: etag || '', savedAt: Date.now() };
  memory.set(url, entry);
  const store = storage();
  if (!store) return;
  try {
    store.setItem(keyFor(url), JSON.stringify(entry));
    pruneStorage(store);
  } catch {}
}

function touchCache(url, entry, etag = entry.etag) {
  writeCache(url, entry.data, etag);
}

function notify(listeners, data) {
  for (const listener of listeners) {
    try {
      listener(data);
    } catch {}
  }
}

function friendlyNetworkError(cause) {
  if (cause?.name === 'AbortError') {
    return new ApiError('make.fun took too long to respond. Please try again.', { cause });
  }
  return new ApiError('We could not reach make.fun. Check your connection and try again.', { cause });
}

function responseError(response) {
  if (response.status === 404) {
    return new ApiError('We could not find that page on make.fun.', { status: 404 });
  }
  if (response.status === 429) {
    return new ApiError('make.fun is receiving a lot of requests. Try again in a moment.', { status: 429 });
  }
  return new ApiError('make.fun could not load this data right now. Please try again.', { status: response.status });
}

function revalidate(url, { onUpdate } = {}) {
  const existing = inflight.get(url);
  if (existing) {
    if (typeof onUpdate === 'function') existing.listeners.add(onUpdate);
    return existing.promise;
  }

  const cached = readCache(url);
  const job = { listeners: new Set(), promise: null };
  if (typeof onUpdate === 'function') job.listeners.add(onUpdate);

  job.promise = Promise.resolve().then(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const headers = { Accept: 'application/json' };
      if (cached?.etag) headers['If-None-Match'] = cached.etag;
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        headers,
        signal: controller.signal,
      });

      if (response.status === 304) {
        if (!cached) throw new ApiError('The cached response is no longer available.', { status: 304 });
        touchCache(url, cached);
        return cached.data;
      }
      if (!response.ok) throw responseError(response);

      let data;
      try {
        data = await response.json();
      } catch (cause) {
        throw new ApiError('make.fun returned data we could not read.', { status: response.status, cause });
      }

      const etag = response.headers.get('etag') || response.headers.get('ETag') || '';
      writeCache(url, data, etag);

      const changed = !cached || JSON.stringify(cached.data) !== JSON.stringify(data);
      if (cached && changed) notify(job.listeners, data);
      return data;
    } catch (cause) {
      if (cached) return cached.data;
      if (cause instanceof ApiError) throw cause;
      throw friendlyNetworkError(cause);
    } finally {
      clearTimeout(timeout);
      if (inflight.get(url) === job) inflight.delete(url);
    }
  });

  inflight.set(url, job);
  return job.promise;
}

function load(url, options) {
  const cached = readCache(url);
  if (!cached) return revalidate(url, options);
  const refresh = revalidate(url, options);
  refresh.catch(() => {});
  return Promise.resolve(cached.data);
}

export function getBounties(options) {
  return load(`${API}/competitions?status=open&activity=times`, options);
}

export function getBounty(slug, options) {
  return load(`${API}/competitions/${encodeURIComponent(slug)}`, options);
}

export function getLeaderboard(slug, options) {
  return load(`${API}/competitions/${encodeURIComponent(slug)}/leaderboard`, options);
}

export function getProfile(handle, options) {
  return load(`${API}/profiles/${encodeURIComponent(handle)}`, options);
}
