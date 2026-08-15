var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var import_welcome_package = __toESM(require("../lib/welcome-package"));
var import_assert = __toESM(require("assert"));
var import_helpers = require("./helpers");
describe("Welcome", () => {
  let welcomePackage;
  beforeEach(() => {
    welcomePackage = new import_welcome_package.default();
  });
  afterEach(() => {
    atom.reset();
  });
  describe("telemetry", () => {
    it("forces core.telemetryConsent to no on activate", async () => {
      atom.config.set("core.telemetryConsent", "undecided");
      atom.config.set("welcome.showOnStartup", false);
      await welcomePackage.activate();
      import_assert.default.equal(atom.config.get("core.telemetryConsent"), "no");
    });
    it("does not open consent or sunsetting panes", async () => {
      atom.config.set("core.telemetryConsent", "undecided");
      atom.config.set("welcome.showOnStartup", true);
      await welcomePackage.activate();
      const titles = atom.workspace.getCenter().getPanes().reduce((acc, pane) => acc.concat(pane.getItems().map((i) => i.getTitle())), []);
      (0, import_assert.default)(!titles.includes("Telemetry Consent"));
      (0, import_assert.default)(!titles.includes("Sunsetting Atom"));
      (0, import_assert.default)(titles.includes("Welcome"));
      (0, import_assert.default)(titles.includes("Welcome Guide"));
    });
  });
  describe("when showOnStartup is true", () => {
    beforeEach(async () => {
      atom.config.set("core.telemetryConsent", "no");
      atom.config.set("welcome.showOnStartup", true);
      await welcomePackage.activate();
    });
    it("shows Welcome and Welcome Guide panes", () => {
      const panes = atom.workspace.getCenter().getPanes();
      import_assert.default.equal(panes.length, 2);
      import_assert.default.equal(panes[0].getItems()[0].getTitle(), "Welcome");
      import_assert.default.equal(panes[1].getItems()[0].getTitle(), "Welcome Guide");
    });
    describe("the welcome:show command", () => {
      it("shows the welcome panes", async () => {
        atom.workspace.getCenter().getPanes().map((pane) => pane.destroy());
        (0, import_assert.default)(!atom.workspace.getActivePaneItem());
        const workspaceElement = atom.views.getView(atom.workspace);
        atom.commands.dispatch(workspaceElement, "welcome:show");
        await (0, import_helpers.conditionPromise)(() => atom.workspace.getActivePaneItem());
        const panes = atom.workspace.getCenter().getPanes();
        import_assert.default.equal(panes.length, 2);
        import_assert.default.equal(panes[0].getItems()[0].getTitle(), "Welcome");
        import_assert.default.equal(panes[1].getItems()[0].getTitle(), "Welcome Guide");
      });
    });
    describe("deserializing the pane items", () => {
      describe("when GuideView is deserialized", () => {
        it("remembers open sections", () => {
          const panes = atom.workspace.getCenter().getPanes();
          const guideView = panes[1].getItems()[0];
          guideView.element.querySelector('details[data-section="snippets"]').setAttribute("open", "open");
          guideView.element.querySelector('details[data-section="init-script"]').setAttribute("open", "open");
          const state = guideView.serialize();
          import_assert.default.deepEqual(state.openSections, ["init-script", "snippets"]);
          const newGuideView = welcomePackage.createGuideView(state);
          (0, import_assert.default)(
            !newGuideView.element.querySelector('details[data-section="packages"]').hasAttribute("open")
          );
          (0, import_assert.default)(
            newGuideView.element.querySelector('details[data-section="snippets"]').hasAttribute("open")
          );
          (0, import_assert.default)(
            newGuideView.element.querySelector('details[data-section="init-script"]').hasAttribute("open")
          );
          (0, import_assert.default)(
            !newGuideView.element.querySelector(
              'details[data-section="teletype"]'
            )
          );
        });
      });
    });
    describe("reporting events", () => {
      let panes, guideView, reportedEvents;
      beforeEach(() => {
        panes = atom.workspace.getCenter().getPanes();
        guideView = panes[1].getItems()[0];
        reportedEvents = [];
        welcomePackage.reporterProxy.sendEvent = (...event) => {
          reportedEvents.push(event);
        };
      });
      describe("GuideView events", () => {
        it("captures expand and collapse events", () => {
          guideView.element.querySelector('details[data-section="packages"] summary').click();
          import_assert.default.deepEqual(reportedEvents, [["expand-packages-section"]]);
          guideView.element.querySelector('details[data-section="packages"]').setAttribute("open", "open");
          guideView.element.querySelector('details[data-section="packages"] summary').click();
          import_assert.default.deepEqual(reportedEvents, [
            ["expand-packages-section"],
            ["collapse-packages-section"]
          ]);
        });
        it("captures button events", () => {
          for (const detailElement of Array.from(
            guideView.element.querySelectorAll("details")
          )) {
            reportedEvents.length = 0;
            const sectionName = detailElement.dataset.section;
            const eventName = `clicked-${sectionName}-cta`;
            const primaryButton = detailElement.querySelector(".btn-primary");
            if (primaryButton) {
              primaryButton.click();
              if (sectionName === "git") {
                import_assert.default.deepEqual(reportedEvents, [["clicked-git-cta"]]);
              } else {
                import_assert.default.deepEqual(reportedEvents, [[eventName]]);
              }
            }
          }
        });
        it("activates settings-view before opening installer and theme picker", async () => {
          const opened = [];
          const activated = [];
          atom.packages.activatePackage = (name) => {
            activated.push(name);
            return Promise.resolve();
          };
          atom.workspace.open = (uri) => {
            opened.push(uri);
            return Promise.resolve();
          };
          await guideView.didClickPackagesButton();
          await guideView.didClickThemesButton();
          import_assert.default.deepEqual(activated, ["settings-view", "settings-view"]);
          import_assert.default.deepEqual(opened, [
            "atom://config/install",
            "atom://config/themes"
          ]);
        });
      });
    });
    describe("when the reporter changes", () => it("sends all queued events", () => {
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
      welcomePackage.reporterProxy.sendEvent("foo", "bar", 10);
      welcomePackage.reporterProxy.sendEvent("foo2", "bar2", 60);
      welcomePackage.reporterProxy.setReporter(reporter1);
      import_assert.default.deepEqual(reporter1.reportedEvents, [
        { category: "welcome-v1", ea: "foo", el: "bar", ev: 10 },
        { category: "welcome-v1", ea: "foo2", el: "bar2", ev: 60 }
      ]);
      welcomePackage.consumeReporter(reporter2);
      import_assert.default.deepEqual(reporter2.reportedEvents, []);
    }));
  });
  describe("when showOnStartup is false", () => {
    it("does not open welcome panes on activate", async () => {
      atom.config.set("core.telemetryConsent", "no");
      atom.config.set("welcome.showOnStartup", false);
      await welcomePackage.activate();
      const itemCount = atom.workspace.getCenter().getPanes().reduce((n, pane) => n + pane.getItems().length, 0);
      import_assert.default.equal(itemCount, 0);
    });
  });
});
