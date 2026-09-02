'use strict';

/**
 * The Install panel: the owned catalog, and what state it is in.
 *
 * Chevron installs owned packages only, from a signed index on a static host
 * (docs/reference/package-artifact-format.md). That index is not published
 * yet, and cpm has no install command, so nothing here can install anything
 * today -- the panel says so rather than offering a button that fails.
 *
 * It exists now because three commands already point at it:
 * settings-view:install-packages-and-themes, the Packages menu entry, and the
 * "Install packages" button on the no-language-server notice. Until this
 * panel was registered, all three opened Settings and rendered nothing.
 *
 * Plain DOM rather than etch: the rest of settings-view ships as esbuild
 * bundles with no readable source, and this does not need to.
 */

const fs = require('fs');
const path = require('path');
const CATALOG = require('./owned-catalog');

// The catalog ships as payloads under <resourcePath>/catalog, so installing
// needs no registry. cpm copies from there into $CHEVRON_HOME/packages and
// fetches whatever the package actually needs -- npm dependencies, or a
// prebuilt server, or nothing when the machine already has one.
function catalogPath(name) {
  const env = global.chevron || global.atom;
  const resourcePath = env && env.getLoadSettings
    ? env.getLoadSettings().resourcePath
    : null;
  if (!resourcePath) return null;

  // In a packaged build resourcePath is …/app.asar, and cpm is a separate
  // process that cannot read a directory inside the archive. The catalog is
  // unpacked (see asarUnpackGlobs), so point at that copy when it exists.
  const packed = path.join(resourcePath, 'catalog', name);
  if (resourcePath.endsWith('.asar')) {
    const unpacked = path.join(`${resourcePath}.unpacked`, 'catalog', name);
    if (fs.existsSync(unpacked)) return unpacked;
  }
  return fs.existsSync(packed) ? packed : null;
}

module.exports = class InstallPanel {
  constructor(settingsView, packageManager) {
    this.settingsView = settingsView;
    this.packageManager = packageManager;
    this.filter = '';
    this.element = document.createElement('div');
    this.element.classList.add('panels-item');
    this.element.tabIndex = -1;
    this.render();
  }

  // Which catalog entries are already present, so the panel does not offer to
  // install something the user has.
  installedNames() {
    const installed = new Set();
    const packages = global.chevron && global.chevron.packages;
    if (!packages) return installed;
    for (const name of packages.getAvailablePackageNames
      ? packages.getAvailablePackageNames()
      : []) {
      installed.add(name);
    }
    return installed;
  }

  matches(entry) {
    if (!this.filter) return true;
    const needle = this.filter.toLowerCase();
    return (
      entry.name.toLowerCase().includes(needle) ||
      entry.title.toLowerCase().includes(needle) ||
      entry.description.toLowerCase().includes(needle) ||
      entry.scopes.some(scope => scope.toLowerCase().includes(needle))
    );
  }

  render() {
    this.element.innerHTML = '';
    const installed = this.installedNames();

    const section = document.createElement('section');
    section.classList.add('section');
    this.element.appendChild(section);

    const container = document.createElement('div');
    container.classList.add('section-container');
    section.appendChild(container);

    const heading = document.createElement('div');
    heading.classList.add('section-heading', 'icon', 'icon-cloud-download');
    heading.textContent = 'Install Packages';
    container.appendChild(heading);

    const search = document.createElement('input');
    search.classList.add('input-search', 'native-key-bindings');
    search.type = 'search';
    search.placeholder = 'Filter packages';
    search.value = this.filter;
    search.addEventListener('input', () => {
      this.filter = search.value;
      this.render();
      const next = this.element.querySelector('.input-search');
      if (next) {
        next.focus();
        next.setSelectionRange(next.value.length, next.value.length);
      }
    });
    container.appendChild(search);


    const list = document.createElement('div');
    list.classList.add('package-container');
    container.appendChild(list);

    const shown = CATALOG.filter(entry => this.matches(entry));
    if (shown.length === 0) {
      const empty = document.createElement('div');
      empty.classList.add('alert', 'alert-warning');
      empty.textContent = `No package matches "${this.filter}".`;
      list.appendChild(empty);
      return;
    }

    for (const entry of shown) {
      list.appendChild(this.cardFor(entry, installed.has(entry.name)));
    }
  }

  cardFor(entry, isInstalled) {
    const card = document.createElement('div');
    card.classList.add('package-card', 'inset-panel');

    const body = document.createElement('div');
    body.classList.add('body');
    card.appendChild(body);

    const title = document.createElement('h4');
    title.classList.add('card-name');
    title.textContent = entry.title;
    body.appendChild(title);

    const description = document.createElement('span');
    description.classList.add('package-description');
    description.textContent = entry.description;
    body.appendChild(description);

    const meta = document.createElement('div');
    meta.classList.add('meta');
    card.appendChild(meta);

    const scopes = document.createElement('span');
    scopes.classList.add('package-version');
    // The scopes are the useful part: this is how someone who saw "no language
    // server for source.rust" finds the package that would serve it.
    scopes.textContent = `${entry.name} ${entry.version} — ${entry.scopes.join(', ')}`;
    meta.appendChild(scopes);

    const controls = document.createElement('div');
    controls.classList.add('meta-controls');
    meta.appendChild(controls);

    const button = document.createElement('button');
    button.classList.add('btn', 'icon', 'icon-cloud-download', 'install-button');
    const source = catalogPath(entry.name);

    if (isInstalled) {
      button.textContent = 'Installed';
      button.classList.add('is-installed');
      button.disabled = true;
      button.title = `${entry.name} is already installed`;
    } else if (!source) {
      button.textContent = 'Install';
      button.disabled = true;
      button.title = 'This build ships no catalog to install from';
    } else {
      button.textContent = 'Install';
      button.addEventListener('click', () => {
        this.install(entry, source, button, card);
      });
    }
    controls.appendChild(button);

    return card;
  }

  install(entry, source, button, card) {
    button.disabled = true;
    button.textContent = 'Installing…';
    this.setStatus(card, 'Installing…');

    // A language server can be a large download, so say what is happening
    // rather than leaving a button greyed out for a minute.
    this.packageManager.runCommand(['install', source], (code, stdout, stderr) => {
      if (code === 0) {
        button.textContent = 'Installed';
        button.classList.add('is-installed');
        this.setStatus(
          card,
          `${entry.title} installed. Reload the window to activate it.`
        );
        return;
      }
      button.disabled = false;
      button.textContent = 'Install';
      const detail = String(stderr || stdout || '').trim();
      // Not the first line: Node writes deprecation warnings to stderr before
      // anything cpm says, and reporting those hides the actual failure.
      const reason =
        detail
          .split('\n')
          .map(line => line.trim())
          .filter(
            line =>
              line &&
              !/^\(node:\d+\)/.test(line) &&
              !/DeprecationWarning/.test(line)
          )
          .pop() || `cpm exited ${code}`;
      this.setStatus(card, `Install failed (exit ${code}): ${reason}`);
      const env = global.chevron || global.atom;
      if (env && env.notifications) {
        env.notifications.addError(`Installing ${entry.name} failed.`, {
          detail: detail || `cpm exited ${code}`,
          dismissable: true
        });
      }
    });
  }

  setStatus(card, text) {
    let status = card.querySelector('.install-status');
    if (!status) {
      status = document.createElement('div');
      status.classList.add('install-status', 'text-subtle');
      card.appendChild(status);
    }
    status.textContent = text;
  }

  focus() {
    const search = this.element.querySelector('.input-search');
    if (search) search.focus();
    else this.element.focus();
  }

  show() {
    this.element.style.display = '';
  }

  beforeShow() {
    this.render();
  }

  dispose() {}

  destroy() {
    this.element.remove();
  }
};
