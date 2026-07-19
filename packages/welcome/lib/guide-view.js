/** @babel */
/** @jsx etch.dom **/

import etch from 'etch';

export default class GuideView {
  constructor(props) {
    this.props = props;
    this.didClickProjectButton = this.didClickProjectButton.bind(this);
    this.didClickGitButton = this.didClickGitButton.bind(this);
    this.didClickGitHubButton = this.didClickGitHubButton.bind(this);
    this.didClickPackagesButton = this.didClickPackagesButton.bind(this);
    this.didClickThemesButton = this.didClickThemesButton.bind(this);
    this.didClickStylingButton = this.didClickStylingButton.bind(this);
    this.didClickInitScriptButton = this.didClickInitScriptButton.bind(this);
    this.didClickSnippetsButton = this.didClickSnippetsButton.bind(this);
    this.didExpandOrCollapseSection = this.didExpandOrCollapseSection.bind(
      this
    );
    etch.initialize(this);
  }

  update() {}

  render() {
    return (
      <div className="welcome is-guide">
        <div className="welcome-container">
          <section className="welcome-panel">
            <h1 className="welcome-title">Get to know Chevron!</h1>
            <p className="welcome-note">
              Pair this tab with <strong>Welcome</strong> for status and links.
              Expand a section below to try a feature.
            </p>

            <details
              className="welcome-card"
              {...this.getSectionProps('project')}
            >
              <summary className="welcome-summary icon icon-repo">
                Open a <span className="welcome-highlight">Project</span>
              </summary>
              <div className="welcome-detail">
                <p>
                  <img
                    className="welcome-img"
                    src="atom://welcome/assets/project.svg"
                  />
                </p>
                <p>
                  In Chevron you can open individual files or a whole folder as a
                  project. Opening a folder adds a tree view so you can browse
                  files.
                </p>
                <p>
                  <button
                    ref="projectButton"
                    onclick={this.didClickProjectButton}
                    className="btn btn-primary"
                  >
                    Open a Project
                  </button>
                </p>
                <p className="welcome-note">
                  <strong>Next time:</strong> open projects from the menu,
                  keyboard shortcut, or by dragging a folder onto the Chevron
                  dock icon (macOS).
                </p>
              </div>
            </details>

            <details className="welcome-card" {...this.getSectionProps('git')}>
              <summary className="welcome-summary icon icon-mark-github">
                Version control with{' '}
                <span className="welcome-highlight">Git and GitHub</span>
              </summary>
              <div className="welcome-detail">
                <p>
                  <img
                    className="welcome-img"
                    src="atom://welcome/assets/package.svg"
                  />
                </p>
                <p>
                  Track changes as you work. Branch, commit, push, and pull
                  without leaving the editor. The GitHub panel talks to
                  GitHub.com when you sign in.
                </p>
                <p>
                  <button
                    onclick={this.didClickGitButton}
                    className="btn btn-primary inline-block"
                  >
                    Open the Git panel
                  </button>
                  <button
                    onclick={this.didClickGitHubButton}
                    className="btn btn-primary inline-block"
                  >
                    Open the GitHub panel
                  </button>
                </p>
                <p className="welcome-note">
                  <strong>Next time:</strong> toggle the Git tab from the{' '}
                  <span className="icon icon-diff" /> control in the status bar.
                </p>
              </div>
            </details>

            <details
              className="welcome-card"
              {...this.getSectionProps('packages')}
            >
              <summary className="welcome-summary icon icon-package">
                Install a <span className="welcome-highlight">Package</span>
              </summary>
              <div className="welcome-detail">
                <p>
                  <img
                    className="welcome-img"
                    src="atom://welcome/assets/package.svg"
                  />
                </p>
                <p>
                  Packages extend Chevron using the Atom package API (
                  <code>global.atom</code>, <code>engines.atom</code>,{' '}
                  <code>apm</code>).
                </p>
                <p className="welcome-note">
                  <strong>Honest status:</strong> the Settings installer still
                  uses the legacy apm path. Public registry search may be
                  limited or broken until the cpm package manager lands. Prefer
                  installing from a local path or git URL when the catalog
                  fails. See the{' '}
                  <a href="https://github.com/builtbygio/chevron">
                    Chevron repository
                  </a>{' '}
                  for current guidance.
                </p>
                <p>
                  <button
                    ref="packagesButton"
                    onclick={this.didClickPackagesButton}
                    className="btn btn-primary"
                  >
                    Open Installer
                  </button>
                </p>
                <p className="welcome-note">
                  <strong>Next time:</strong> install packages from Settings.
                </p>
              </div>
            </details>

            <details
              className="welcome-card"
              {...this.getSectionProps('themes')}
            >
              <summary className="welcome-summary icon icon-paintcan">
                Choose a <span className="welcome-highlight">Theme</span>
              </summary>
              <div className="welcome-detail">
                <p>
                  <img
                    className="welcome-img"
                    src="atom://welcome/assets/theme.svg"
                  />
                </p>
                <p>Chevron ships with preinstalled themes. Try a few.</p>
                <p>
                  <button
                    ref="themesButton"
                    onclick={this.didClickThemesButton}
                    className="btn btn-primary"
                  >
                    Open the theme picker
                  </button>
                </p>
                <p>
                  Community themes install the same way as packages (with the
                  same registry caveats as above). In Installer, switch the
                  toggle to “themes”.
                </p>
                <p className="welcome-note">
                  <strong>Next time:</strong> switch themes from Settings.
                </p>
              </div>
            </details>

            <details
              className="welcome-card"
              {...this.getSectionProps('styling')}
            >
              <summary className="welcome-summary icon icon-paintcan">
                Customize the <span className="welcome-highlight">Styling</span>
              </summary>
              <div className="welcome-detail">
                <p>
                  <img
                    className="welcome-img"
                    src="atom://welcome/assets/code.svg"
                  />
                </p>
                <p>
                  Customize almost anything by adding your own CSS/LESS in your
                  user stylesheet (under your config home —{' '}
                  <code>~/.atom</code> by default, or{' '}
                  <code>CHEVRON_HOME</code> / <code>~/.chevron</code> when set).
                </p>
                <p>
                  <button
                    ref="stylingButton"
                    onclick={this.didClickStylingButton}
                    className="btn btn-primary"
                  >
                    Open your Stylesheet
                  </button>
                </p>
                <p>Uncomment examples or try your own rules.</p>
                <p className="welcome-note">
                  <strong>Next time:</strong> open your stylesheet from Menu →{' '}
                  {this.getApplicationMenuName()}.
                </p>
              </div>
            </details>

            <details
              className="welcome-card"
              {...this.getSectionProps('init-script')}
            >
              <summary className="welcome-summary icon icon-code">
                Hack on the <span className="welcome-highlight">Init Script</span>
              </summary>
              <div className="welcome-detail">
                <p>
                  <img
                    className="welcome-img"
                    src="atom://welcome/assets/code.svg"
                  />
                </p>
                <p>
                  The init script is JavaScript or CoffeeScript run at startup.
                  Use it to quickly change Chevron’s behaviour. It lives in the
                  same config home as your stylesheet (
                  <code>~/.atom</code> by default).
                </p>
                <p>
                  <button
                    ref="initScriptButton"
                    onclick={this.didClickInitScriptButton}
                    className="btn btn-primary"
                  >
                    Open your Init Script
                  </button>
                </p>
                <p>Uncomment examples or try your own.</p>
                <p className="welcome-note">
                  <strong>Next time:</strong> open your init script from Menu →{' '}
                  {this.getApplicationMenuName()}.
                </p>
              </div>
            </details>

            <details
              className="welcome-card"
              {...this.getSectionProps('snippets')}
            >
              <summary className="welcome-summary icon icon-code">
                Add a <span className="welcome-highlight">Snippet</span>
              </summary>
              <div className="welcome-detail">
                <p>
                  <img
                    className="welcome-img"
                    src="atom://welcome/assets/code.svg"
                  />
                </p>
                <p>
                  Snippets expand a short prefix into a larger code block with
                  templated values (stored under your config home).
                </p>
                <p>
                  <button
                    ref="snippetsButton"
                    onclick={this.didClickSnippetsButton}
                    className="btn btn-primary"
                  >
                    Open your Snippets
                  </button>
                </p>
                <p>
                  In your snippets file, type <code>snip</code> then hit{' '}
                  <code>tab</code> to expand a template for a new snippet.
                </p>
                <p className="welcome-note">
                  <strong>Next time:</strong> open snippets from Menu →{' '}
                  {this.getApplicationMenuName()}.
                </p>
              </div>
            </details>

            <details
              className="welcome-card"
              {...this.getSectionProps('shortcuts')}
            >
              <summary className="welcome-summary icon icon-keyboard">
                Learn <span className="welcome-highlight">Keyboard Shortcuts</span>
              </summary>
              <div className="welcome-detail">
                <p>
                  <img
                    className="welcome-img"
                    src="atom://welcome/assets/shortcut.svg"
                  />
                </p>
                <p>
                  If you only remember one shortcut, make it{' '}
                  <kbd className="welcome-key">
                    {this.getCommandPaletteKeyBinding()}
                  </kbd>
                  . That toggles the command palette, which lists every Chevron
                  command.
                </p>
                <p>
                  To reopen these guides, open the command palette and search for{' '}
                  <span className="text-highlight">Welcome</span>.
                </p>
              </div>
            </details>
          </section>
        </div>
      </div>
    );
  }

  getSectionProps(sectionName) {
    const props = {
      dataset: { section: sectionName },
      onclick: this.didExpandOrCollapseSection
    };
    if (
      this.props.openSections &&
      this.props.openSections.indexOf(sectionName) !== -1
    ) {
      props.open = true;
    }
    return props;
  }

  getCommandPaletteKeyBinding() {
    if (process.platform === 'darwin') {
      return 'cmd-shift-p';
    } else {
      return 'ctrl-shift-p';
    }
  }

  getApplicationMenuName() {
    if (process.platform === 'darwin') {
      return 'Chevron';
    } else if (process.platform === 'linux') {
      return 'Edit';
    } else {
      return 'File';
    }
  }

  serialize() {
    return {
      deserializer: this.constructor.name,
      openSections: this.getOpenSections(),
      uri: this.getURI()
    };
  }

  getURI() {
    return this.props.uri;
  }

  getTitle() {
    return 'Welcome Guide';
  }

  isEqual(other) {
    return other instanceof GuideView;
  }

  getOpenSections() {
    return Array.from(this.element.querySelectorAll('details[open]')).map(
      sectionElement => sectionElement.dataset.section
    );
  }

  didClickProjectButton() {
    this.props.reporterProxy.sendEvent('clicked-project-cta');
    atom.commands.dispatch(
      atom.views.getView(atom.workspace),
      'application:open'
    );
  }

  didClickGitButton() {
    this.props.reporterProxy.sendEvent('clicked-git-cta');
    atom.commands.dispatch(
      atom.views.getView(atom.workspace),
      'github:toggle-git-tab'
    );
  }

  didClickGitHubButton() {
    this.props.reporterProxy.sendEvent('clicked-github-cta');
    atom.commands.dispatch(
      atom.views.getView(atom.workspace),
      'github:toggle-github-tab'
    );
  }

  didClickPackagesButton() {
    this.props.reporterProxy.sendEvent('clicked-packages-cta');
    atom.workspace.open('atom://config/install', { split: 'left' });
  }

  didClickThemesButton() {
    this.props.reporterProxy.sendEvent('clicked-themes-cta');
    atom.workspace.open('atom://config/themes', { split: 'left' });
  }

  didClickStylingButton() {
    this.props.reporterProxy.sendEvent('clicked-styling-cta');
    atom.workspace.open('atom://.atom/stylesheet', { split: 'left' });
  }

  didClickInitScriptButton() {
    this.props.reporterProxy.sendEvent('clicked-init-script-cta');
    atom.workspace.open('atom://.atom/init-script', { split: 'left' });
  }

  didClickSnippetsButton() {
    this.props.reporterProxy.sendEvent('clicked-snippets-cta');
    atom.workspace.open('atom://.atom/snippets', { split: 'left' });
  }

  didExpandOrCollapseSection(event) {
    const sectionName = event.currentTarget.closest('details').dataset.section;
    const action = event.currentTarget.hasAttribute('open')
      ? 'collapse'
      : 'expand';
    this.props.reporterProxy.sendEvent(`${action}-${sectionName}-section`);
  }
}
