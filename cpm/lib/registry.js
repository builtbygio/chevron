'use strict';

/**
 * Phase 2: package registry client.
 * Default backend: Pulsar package-backend (atom.io-compatible corpus).
 * Override with CPM_REGISTRY_URL (no trailing slash), e.g.
 *   https://api.pulsar-edit.dev
 */

const DEFAULT_REGISTRY_URL = 'https://api.pulsar-edit.dev';

function getRegistryBaseUrl() {
  const raw =
    process.env.CPM_REGISTRY_URL ||
    process.env.ATOM_PACKAGE_REGISTRY ||
    DEFAULT_REGISTRY_URL;
  return String(raw).replace(/\/+$/, '');
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'chevron-cpm'
    },
    ...options
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(
      `Registry HTTP ${res.status} for ${url}${body ? `: ${body.slice(0, 200)}` : ''}`
    );
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Search packages. Returns normalized list of hits.
 */
async function searchPackages(query, options = {}) {
  const page = options.page || 1;
  const base = getRegistryBaseUrl();
  const q = encodeURIComponent(query || '');
  const url = `${base}/api/packages/search?q=${q}&page=${page}`;
  const data = await fetchJson(url);
  const list = Array.isArray(data) ? data : data.packages || data.hits || [];
  return list.map(normalizeSearchHit);
}

/**
 * Full package metadata (includes versions when available).
 */
async function getPackage(name) {
  const base = getRegistryBaseUrl();
  const url = `${base}/api/packages/${encodeURIComponent(name)}`;
  const data = await fetchJson(url);
  return normalizePackage(data);
}

/**
 * Resolve an installable specifier for a registry package name.
 * Prefers dist.tarball for latest release; falls back to git#sha;
 * then atom/pulsar-edit standalone repos (not monorepo root without sha).
 */
async function resolveInstallSpec(name, version) {
  const pkg = await getPackage(name);
  const latest =
    version ||
    (pkg.releases && pkg.releases.latest) ||
    (pkg.versions &&
      Object.keys(pkg.versions).length &&
      Object.keys(pkg.versions).sort(semverRcompare)[0]) ||
    null;

  const verMeta =
    latest && pkg.versions && pkg.versions[latest]
      ? pkg.versions[latest]
      : null;

  if (verMeta && verMeta.dist && verMeta.dist.tarball) {
    return {
      spec: verMeta.dist.tarball,
      name: pkg.name,
      version: latest,
      source: 'tarball',
      repository: pkg.repository
    };
  }

  const repoUrl =
    (pkg.repository && (pkg.repository.url || pkg.repository)) || null;
  const sha = verMeta && verMeta.sha;

  // Dedicated package repo + commit (preferred git path)
  if (repoUrl && sha && !isMonorepoPackageRepo(repoUrl, name)) {
    const gitUrl = normalizeGitUrl(repoUrl);
    return {
      spec: `${gitUrl}#${sha}`,
      name: pkg.name,
      version: latest || sha.slice(0, 7),
      source: 'git',
      repository: pkg.repository
    };
  }

  // Heuristic standalone repos (many Atom packages live under atom/*)
  const candidates = githubPackageCandidates(name, repoUrl);
  if (candidates.length) {
    return {
      spec: candidates[0],
      name: pkg.name,
      version: latest || 'HEAD',
      source: 'git',
      repository: pkg.repository,
      note: 'resolved via github package heuristic (no registry tarball)'
    };
  }

  if (repoUrl && !isMonorepoPackageRepo(repoUrl, name)) {
    return {
      spec: normalizeGitUrl(repoUrl),
      name: pkg.name,
      version: latest || 'HEAD',
      source: 'git',
      repository: pkg.repository
    };
  }

  throw new Error(
    `Cannot resolve install source for ${name}` +
      (latest ? `@${latest}` : '') +
      ' (no tarball; repository is monorepo or missing). Try: cpm install git+https://github.com/atom/' +
      name +
      '.git'
  );
}

function isMonorepoPackageRepo(repoUrl, packageName) {
  const u = String(repoUrl).toLowerCase();
  // pulsar-edit/pulsar and atom/atom host many packages but are not installable as the whole repo
  if (u.includes('github.com/pulsar-edit/pulsar')) return true;
  if (u.includes('github.com/atom/atom')) return true;
  if (u.includes('github.com/atom/atom.git')) return true;
  return false;
}

function githubPackageCandidates(name, repoUrl) {
  const out = [];
  const bare = String(name).replace(/^@[^/]+\//, '');
  // Prefer atom/* then pulsar-edit/* standalone
  out.push(`git+https://github.com/atom/${bare}.git`);
  out.push(`git+https://github.com/pulsar-edit/${bare}.git`);
  if (repoUrl && !isMonorepoPackageRepo(repoUrl, name)) {
    out.unshift(normalizeGitUrl(repoUrl));
  }
  return [...new Set(out)];
}

function normalizeGitUrl(url) {
  let u = String(url).trim();
  if (u.startsWith('git+')) return u;
  if (u.startsWith('https://') || u.startsWith('http://') || u.startsWith('git://')) {
    return `git+${u}`;
  }
  if (u.startsWith('git@')) {
    return `git+ssh://${u.replace(':', '/')}`;
  }
  return `git+https://github.com/${u}.git`;
}

function normalizeSearchHit(raw) {
  const meta = raw.metadata || {};
  return {
    name: raw.name || meta.name,
    description: meta.description || raw.description || '',
    version:
      (raw.releases && raw.releases.latest) ||
      meta.version ||
      null,
    downloads: Number(raw.downloads) || 0,
    stars: Number(raw.stargazers_count) || 0,
    repository: raw.repository || meta.repository || null,
    engines: meta.engines || null
  };
}

function normalizePackage(raw) {
  return {
    name: raw.name,
    description: (raw.metadata && raw.metadata.description) || '',
    readme: raw.readme || (raw.metadata && raw.metadata.readme) || '',
    downloads: Number(raw.downloads) || 0,
    stars: Number(raw.stargazers_count) || 0,
    repository: raw.repository || null,
    releases: raw.releases || {},
    versions: raw.versions || {},
    metadata: raw.metadata || {},
    owner: raw.owner || null
  };
}

function semverRcompare(a, b) {
  // lightweight reverse sort: prefer higher when simple x.y.z
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pb[i] || 0) - (pa[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** True if spec looks like a bare package name (not path/url/git). */
function isBarePackageName(spec) {
  if (!spec || typeof spec !== 'string') return false;
  if (spec.includes('://') || spec.startsWith('git+') || spec.startsWith('file:')) {
    return false;
  }
  if (spec.startsWith('.') || spec.startsWith('/') || /^[A-Za-z]:\\/.test(spec)) {
    return false;
  }
  // name or name@version or @scope/name
  return /^(@[\w.-]+\/)?[\w.-]+(@[^@]+)?$/.test(spec);
}

function parseNameVersion(spec) {
  if (spec.startsWith('@')) {
    const at = spec.lastIndexOf('@');
    if (at > 0) {
      return { name: spec.slice(0, at), version: spec.slice(at + 1) };
    }
    return { name: spec, version: null };
  }
  const parts = spec.split('@');
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { name: parts[0], version: parts[1] };
  }
  return { name: spec, version: null };
}

module.exports = {
  DEFAULT_REGISTRY_URL,
  getRegistryBaseUrl,
  searchPackages,
  getPackage,
  resolveInstallSpec,
  isBarePackageName,
  parseNameVersion,
  normalizeSearchHit
};
