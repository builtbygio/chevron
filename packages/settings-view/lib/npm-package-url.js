// Where a package card's link goes.
//
// Chevron has no registry of its own. Most packages are published to npm under
// `@builtbygio/`, but six are not: the owned catalog installs from a local
// path (cpm/lib/commands/install.js) and the in-repo originals -- breadcrumbs,
// diff-review, sticky-scroll, terminal -- have never been published. Nothing
// on disk distinguishes them, and a hardcoded list drifts the moment one is
// published, so the registry is asked at click time and the repository is the
// answer when it says no.

const OWNED_NPM_SCOPE = '@builtbygio/';
const REGISTRY = 'https://registry.npmjs.org';
const TIMEOUT_MS = 3000;

// The npm name for a package id. `publishName` is set where a name is
// normalised off cpm output; failing that the id is scoped, because a manifest
// name is not reliable here -- chevron-lsp-typescript declares itself unscoped
// and is published as @builtbygio/chevron-lsp-typescript.
function npmPublishName(pack) {
  if (pack && typeof pack.publishName === 'string' && pack.publishName) {
    return pack.publishName;
  }
  const name = pack && pack.name;
  if (typeof name !== 'string' || !name) return null;
  return name.startsWith('@') ? name : OWNED_NPM_SCOPE + name;
}

function npmPackageUrl(pack) {
  const published = npmPublishName(pack);
  return published ? `https://www.npmjs.com/package/${published}` : null;
}

function repositoryUrl(pack) {
  // cpm reports `repository` at the top level; a loaded package carries it
  // under `metadata`.
  const source = (pack && pack.metadata) || pack || {};
  const repository = source.repository;
  let url =
    repository && typeof repository === 'object' ? repository.url : repository;
  if (typeof url !== 'string') return '';
  const sshMatch = url.match(/^git@github\.com:(.+)$/);
  if (sshMatch) url = `https://github.com/${sshMatch[1]}`;
  return url
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
}

async function isOnRegistry(publishName, { fetchImpl, timeoutMs }) {
  if (typeof fetchImpl !== 'function') return false;
  const controller =
    typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    const response = await fetchImpl(
      `${REGISTRY}/${publishName.replace('/', '%2f')}`,
      { method: 'HEAD', signal: controller ? controller.signal : undefined }
    );
    return Boolean(response && response.ok);
  } catch (error) {
    return false; // offline, blocked, or slower than the timeout
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Resolves to the URL to open, or null when the package offers neither.
async function resolvePackageUrl(pack, options = {}) {
  const npmUrl = npmPackageUrl(pack);
  const repository = repositoryUrl(pack);
  if (!npmUrl) return repository || null;
  if (!repository) return npmUrl; // nothing better to fall back to

  const onRegistry = await isOnRegistry(npmPublishName(pack), {
    fetchImpl: options.fetch || globalThis.fetch,
    timeoutMs: options.timeoutMs != null ? options.timeoutMs : TIMEOUT_MS
  });
  return onRegistry ? npmUrl : repository;
}

module.exports = {
  OWNED_NPM_SCOPE,
  npmPublishName,
  npmPackageUrl,
  repositoryUrl,
  resolvePackageUrl
};
