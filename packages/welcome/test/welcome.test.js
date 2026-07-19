/** @babel */
/* global beforeEach, afterEach, describe, it */

import WelcomePackage from '../lib/welcome-package';
import assert from 'assert';
import { conditionPromise } from './helpers';

describe('Welcome', () => {
  let welcomePackage;

  beforeEach(() => {
    welcomePackage = new WelcomePackage();
  });

  afterEach(() => {
    atom.reset();
  });

  describe('telemetry', () => {
    it('forces core.telemetryConsent to no on activate', async () => {
      atom.config.set('core.telemetryConsent', 'undecided');
      atom.config.set('welcome.showOnStartup', false);
      await welcomePackage.activate();
      assert.equal(atom.config.get('core.telemetryConsent'), 'no');
    });

    it('does not open consent or sunsetting panes', async () => {
      atom.config.set('core.telemetryConsent', 'undecided');
      atom.config.set('welcome.showOnStartup', true);
      await welcomePackage.activate();

      const titles = atom.workspace
        .getCenter()
        .getPanes()
        .reduce((acc, pane) => acc.concat(pane.getItems().map(i => i.getTitle())), []);

      assert(!titles.includes('Telemetry Consent'));
      assert(!titles.includes('Sunsetting Atom'));
      assert(titles.includes('Welcome'));
      assert(titles.includes('Welcome Guide'));
    });
  });

  describe('when showOnStartup is true', () => {
    beforeEach(async () => {
      atom.config.set('core.telemetryConsent', 'no');
      atom.config.set('welcome.showOnStartup', true);
      await welcomePackage.activate();
    });

    it('shows Welcome and Welcome Guide panes', () => {
      const panes = atom.workspace.getCenter().getPanes();
      assert.equal(panes.length, 2);
      assert.equal(panes[0].getItems()[0].getTitle(), 'Welcome');
      assert.equal(panes[1].getItems()[0].getTitle(), 'Welcome Guide');
    });

    describe('the welcome:show command', () => {
      it('shows the welcome panes', async () => {
        atom.workspace
          .getCenter()
          .getPanes()
          .map(pane => pane.destroy());
        assert(!atom.workspace.getActivePaneItem());

        const workspaceElement = atom.views.getView(atom.workspace);
        atom.commands.dispatch(workspaceElement, 'welcome:show');

        await conditionPromise(() => atom.workspace.getActivePaneItem());

        const panes = atom.workspace.getCenter().getPanes();
        assert.equal(panes.length, 2);
        assert.equal(panes[0].getItems()[0].getTitle(), 'Welcome');
        assert.equal(panes[1].getItems()[0].getTitle(), 'Welcome Guide');
      });
    });

    describe('deserializing the pane items', () => {
      describe('when GuideView is deserialized', () => {
        it('remembers open sections', () => {
          const panes = atom.workspace.getCenter().getPanes();
          const guideView = panes[1].getItems()[0];

          guideView.element
            .querySelector('details[data-section="snippets"]')
            .setAttribute('open', 'open');
          guideView.element
            .querySelector('details[data-section="init-script"]')
            .setAttribute('open', 'open');

          const state = guideView.serialize();

          assert.deepEqual(state.openSections, ['init-script', 'snippets']);

          const newGuideView = welcomePackage.createGuideView(state);
          assert(
            !newGuideView.element
              .querySelector('details[data-section="packages"]')
              .hasAttribute('open')
          );
          assert(
            newGuideView.element
              .querySelector('details[data-section="snippets"]')
              .hasAttribute('open')
          );
          assert(
            newGuideView.element
              .querySelector('details[data-section="init-script"]')
              .hasAttribute('open')
          );
          assert(
            !newGuideView.element.querySelector(
              'details[data-section="teletype"]'
            )
          );
        });
      });
    });

    describe('reporting events', () => {
      let panes, guideView, reportedEvents;
      beforeEach(() => {
        panes = atom.workspace.getCenter().getPanes();
        guideView = panes[1].getItems()[0];
        reportedEvents = [];

        welcomePackage.reporterProxy.sendEvent = (...event) => {
          reportedEvents.push(event);
        };
      });

      describe('GuideView events', () => {
        it('captures expand and collapse events', () => {
          guideView.element
            .querySelector('details[data-section="packages"] summary')
            .click();
          assert.deepEqual(reportedEvents, [['expand-packages-section']]);

          guideView.element
            .querySelector('details[data-section="packages"]')
            .setAttribute('open', 'open');
          guideView.element
            .querySelector('details[data-section="packages"] summary')
            .click();
          assert.deepEqual(reportedEvents, [
            ['expand-packages-section'],
            ['collapse-packages-section']
          ]);
        });

        it('captures button events', () => {
          for (const detailElement of Array.from(
            guideView.element.querySelectorAll('details')
          )) {
            reportedEvents.length = 0;

            const sectionName = detailElement.dataset.section;
            const eventName = `clicked-${sectionName}-cta`;
            const primaryButton = detailElement.querySelector('.btn-primary');
            if (primaryButton) {
              primaryButton.click();
              // First primary button in git section fires git-cta only.
              if (sectionName === 'git') {
                assert.deepEqual(reportedEvents, [['clicked-git-cta']]);
              } else {
                assert.deepEqual(reportedEvents, [[eventName]]);
              }
            }
          }
        });
      });
    });

    describe('when the reporter changes', () =>
      it('sends all queued events', () => {
        welcomePackage.reporterProxy.queue.length = 0;

        const reporter1 = {
          addCustomEvent(category, event) {
            this.reportedEvents.push({ category, ...event });
          },
          reportedEvents: []
        };
        const reporter2 = {
          addCustomEvent(category, event) {
            this.reportedEvents.push({ category, ...event });
          },
          reportedEvents: []
        };

        welcomePackage.reporterProxy.sendEvent('foo', 'bar', 10);
        welcomePackage.reporterProxy.sendEvent('foo2', 'bar2', 60);
        welcomePackage.reporterProxy.setReporter(reporter1);

        assert.deepEqual(reporter1.reportedEvents, [
          { category: 'welcome-v1', ea: 'foo', el: 'bar', ev: 10 },
          { category: 'welcome-v1', ea: 'foo2', el: 'bar2', ev: 60 }
        ]);

        welcomePackage.consumeReporter(reporter2);
        assert.deepEqual(reporter2.reportedEvents, []);
      }));
  });

  describe('when showOnStartup is false', () => {
    it('does not open welcome panes on activate', async () => {
      atom.config.set('core.telemetryConsent', 'no');
      atom.config.set('welcome.showOnStartup', false);
      await welcomePackage.activate();

      const itemCount = atom.workspace
        .getCenter()
        .getPanes()
        .reduce((n, pane) => n + pane.getItems().length, 0);
      assert.equal(itemCount, 0);
    });
  });
});
