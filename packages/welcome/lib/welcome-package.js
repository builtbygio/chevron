/** @babel */

import { CompositeDisposable } from 'atom';
import ReporterProxy from './reporter-proxy';

let WelcomeView, GuideView;

const WELCOME_URI = 'atom://welcome/welcome';
const GUIDE_URI = 'atom://welcome/guide';

export default class WelcomePackage {
  constructor() {
    this.reporterProxy = new ReporterProxy();
  }

  async activate() {
    this.subscriptions = new CompositeDisposable();

    this.subscriptions.add(
      atom.workspace.addOpener(filePath => {
        if (filePath === WELCOME_URI) {
          return this.createWelcomeView({ uri: WELCOME_URI });
        }
      })
    );

    this.subscriptions.add(
      atom.workspace.addOpener(filePath => {
        if (filePath === GUIDE_URI) {
          return this.createGuideView({ uri: GUIDE_URI });
        }
      })
    );

    this.subscriptions.add(
      atom.commands.add('atom-workspace', 'welcome:show', () =>
        this.showWelcome()
      )
    );

    // Chevron does not collect telemetry. Force consent off if leftover config
    // from Atom still says undecided/limited.
    if (atom.config.get('core.telemetryConsent') !== 'no') {
      atom.config.set('core.telemetryConsent', 'no');
    }

    if (atom.config.get('welcome.showOnStartup')) {
      await this.showWelcome();
      this.reporterProxy.sendEvent('show-on-initial-load');
    }
  }

  showWelcome() {
    // Open as adjacent tabs in the active pane. Split left/right used to leave
    // an empty center after closing Welcome Guide and confused focus when
    // opening files from the tree view.
    return Promise.all([
      atom.workspace.open(WELCOME_URI, { searchAllPanes: true }),
      atom.workspace.open(GUIDE_URI, { searchAllPanes: true })
    ]);
  }

  consumeReporter(reporter) {
    return this.reporterProxy.setReporter(reporter);
  }

  deactivate() {
    this.subscriptions.dispose();
  }

  createWelcomeView(state) {
    if (WelcomeView == null) WelcomeView = require('./welcome-view');
    return new WelcomeView({ reporterProxy: this.reporterProxy, ...state });
  }

  createGuideView(state) {
    if (GuideView == null) GuideView = require('./guide-view');
    return new GuideView({ reporterProxy: this.reporterProxy, ...state });
  }
}
