/** @babel */
/** @jsx etch.dom **/

import etch from 'etch';

export default class WelcomeView {
  constructor(props) {
    this.props = props;
    this.didChangeShowOnStartup = this.didChangeShowOnStartup.bind(this);
    this.didClickOpenProject = this.didClickOpenProject.bind(this);
    this.didClickInstallShellCommands = this.didClickInstallShellCommands.bind(
      this
    );
    this.didClickShowGuide = this.didClickShowGuide.bind(this);
    etch.initialize(this);

    this.element.addEventListener('click', event => {
      const link = event.target.closest('a');
      if (link && link.dataset.event) {
        this.props.reporterProxy.sendEvent(
          `clicked-welcome-${link.dataset.event}-link`
        );
      }
    });
  }

  didChangeShowOnStartup(event) {
    atom.config.set('welcome.showOnStartup', event.target.checked);
  }

  didClickOpenProject() {
    this.props.reporterProxy.sendEvent('clicked-welcome-open-project');
    atom.commands.dispatch(
      atom.views.getView(atom.workspace),
      'application:open'
    );
  }

  didClickInstallShellCommands() {
    this.props.reporterProxy.sendEvent('clicked-welcome-shell-commands');
    atom.commands.dispatch(
      atom.views.getView(atom.workspace),
      'window:install-shell-commands'
    );
  }

  didClickShowGuide() {
    this.props.reporterProxy.sendEvent('clicked-welcome-show-guide');
    atom.workspace.open('atom://welcome/guide', { searchAllPanes: true });
  }

  update() {}

  serialize() {
    return {
      deserializer: 'WelcomeView',
      uri: this.props.uri
    };
  }

  render() {
    // CommandInstaller targets /usr/local/bin (macOS + Linux). Windows uses other PATH setup.
    const showShellNudge =
      process.platform === 'darwin' || process.platform === 'linux';

    return (
      <div className="welcome">
        <div className="welcome-container">
          <header className="welcome-header">
            <a href="https://github.com/builtbygio/chevron">
              <svg
                className="welcome-logo"
                width="280px"
                height="64px"
                viewBox="0 0 280 64"
                aria-label="Chevron"
              >
                <g fill="currentColor" transform="translate(4, 8)">
                  <path d="M4 4 L22 24 L4 44 L12 44 L30 24 L12 4 Z M26 4 L44 24 L26 44 L34 44 L52 24 L34 4 Z" />
                </g>
                <text
                  x="72"
                  y="42"
                  fill="currentColor"
                  font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
                  font-size="36"
                  font-weight="600"
                  letter-spacing="-0.5"
                >
                  Chevron
                </text>
              </svg>
              <h1 className="welcome-title">Hackable. Fast. Yours.</h1>
            </a>
          </header>

          <section className="welcome-panel">
            <p>
              Chevron is a modernised fork of Atom. Package APIs stay{' '}
              <code>atom://</code>-compatible.
            </p>
            <p>
              This window also opens the <strong>Welcome Guide</strong> tab —
              short walkthroughs for projects, Git, packages, and customization.
              You can reopen both anytime from the Help menu or the command
              palette (<span className="text-highlight">Welcome</span>).
            </p>
            <p>
              <button
                className="btn btn-primary inline-block"
                onclick={this.didClickOpenProject}
              >
                Open a Project
              </button>
              <button
                className="btn inline-block"
                onclick={this.didClickShowGuide}
              >
                Focus Welcome Guide
              </button>
              {showShellNudge ? (
                <button
                  className="btn inline-block"
                  onclick={this.didClickInstallShellCommands}
                >
                  Install Shell Commands
                </button>
              ) : null}
            </p>
            {showShellNudge ? (
              <p className="welcome-note">
                <strong>Shell commands:</strong> installs{' '}
                <code>chevron</code>, <code>atom</code>, and <code>apm</code> on
                your PATH (same as Chevron → Install Shell Commands). Also
                available later from the application menu.
              </p>
            ) : (
              <p className="welcome-note">
                <strong>Tip:</strong> On macOS you can install{' '}
                <code>chevron</code> / <code>atom</code> / <code>apm</code> on
                PATH from the application menu. On Linux/Windows, use your
                package install or PATH setup from the build docs.
              </p>
            )}
          </section>

          <section className="welcome-panel">
            <h2 className="welcome-title" style={{ fontSize: '1.25em' }}>
              What works / what is early
            </h2>
            <ul>
              <li>
                <strong>Works today:</strong> multi-platform builds (Linux,
                macOS, Windows), Electron 43 dogfood, dual-support package API (
                <code>global.atom</code>, <code>engines.atom</code>,{' '}
                <code>apm</code>), core editing and bundled packages.
              </li>
              <li>
                <strong>Still early:</strong> not a polished daily-driver
                release yet. Community package search/install depends on legacy
                apm/registry paths and may be limited until the cpm package
                manager lands.
              </li>
              <li>
                Docs and issues:{' '}
                <a
                  href="https://github.com/builtbygio/chevron"
                  dataset={{ event: 'chevron-repo' }}
                >
                  builtbygio/chevron
                </a>
                .
              </li>
            </ul>
          </section>

          <section className="welcome-panel">
            <p>For help</p>
            <ul>
              <li>
                The{' '}
                <a
                  href="https://github.com/builtbygio/chevron"
                  dataset={{ event: 'chevron-repo-help' }}
                >
                  Chevron repository
                </a>{' '}
                for docs, issues, and releases.
              </li>
              <li>
                Community packages use the Atom package API (
                <code>global.atom</code>, <code>engines.atom</code>,{' '}
                <code>apm</code>).
              </li>
              <li>
                Historical Atom references:{' '}
                <a
                  href="https://github.com/atom/atom"
                  dataset={{ event: 'atom-archive' }}
                >
                  atom/atom archive
                </a>
                .
              </li>
            </ul>
          </section>

          <section className="welcome-panel">
            <label>
              <input
                className="input-checkbox"
                type="checkbox"
                checked={atom.config.get('welcome.showOnStartup')}
                onchange={this.didChangeShowOnStartup}
              />
              Show Welcome and Guide when opening Chevron
            </label>
            <p className="welcome-note">
              When checked, every new window opens these panes until you uncheck
              this box.
            </p>
          </section>

          <footer className="welcome-footer">
            <a
              href="https://github.com/builtbygio/chevron"
              dataset={{ event: 'footer-chevron' }}
            >
              builtbygio/chevron
            </a>
          </footer>
        </div>
      </div>
    );
  }

  getURI() {
    return this.props.uri;
  }

  getTitle() {
    return 'Welcome';
  }

  isEqual(other) {
    return other instanceof WelcomeView;
  }
}
