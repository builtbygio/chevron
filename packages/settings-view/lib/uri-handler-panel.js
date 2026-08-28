var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var uri_handler_panel_exports = {};
__export(uri_handler_panel_exports, {
  default: () => UriHandlerPanel
});
module.exports = __toCommonJS(uri_handler_panel_exports);
var import_atom = require("chevron");
var import_etch = __toESM(require("etch"));
function isSupported() {
  return ["win32", "darwin"].includes(process.platform);
}
function isDefaultProtocolClient() {
  const { ipcRenderer } = require("electron");
  return ipcRenderer.sendSync("atom-is-default-protocol-client-sync", "atom", process.execPath, ["--uri-handler", "--"]);
}
function setAsDefaultProtocolClient() {
  if (!isSupported()) return false;
  const { ipcRenderer } = require("electron");
  return ipcRenderer.sendSync("atom-set-as-default-protocol-client-sync", "atom", process.execPath, ["--uri-handler", "--"]);
}
class UriHandlerPanel {
  constructor() {
    this.handleChange = this.handleChange.bind(this);
    this.handleBecomeProtocolClient = this.handleBecomeProtocolClient.bind(this);
    this.isDefaultProtocolClient = isDefaultProtocolClient();
    this.uriHistory = [];
    import_etch.default.initialize(this);
    this.subscriptions = new import_atom.CompositeDisposable();
    this.subscriptions.add(
      chevron.commands.add(this.element, {
        "core:move-up": () => {
          this.scrollUp();
        },
        "core:move-down": () => {
          this.scrollDown();
        },
        "core:page-up": () => {
          this.pageUp();
        },
        "core:page-down": () => {
          this.pageDown();
        },
        "core:move-to-top": () => {
          this.scrollToTop();
        },
        "core:move-to-bottom": () => {
          this.scrollToBottom();
        }
      }),
      chevron.uriHandlerRegistry.onHistoryChange(() => {
        this.uriHistory = chevron.uriHandlerRegistry.getRecentlyHandledURIs();
        import_etch.default.update(this);
      })
    );
  }
  destroy() {
    this.subscriptions.dispose();
    return import_etch.default.destroy(this);
  }
  update() {
  }
  render() {
    const schema = chevron.config.getSchema("core.uriHandlerRegistration");
    return /* @__PURE__ */ import_etch.default.dom("div", { className: "panels-item", tabIndex: "0" }, /* @__PURE__ */ import_etch.default.dom("form", { className: "general-panel section" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "settings-panel" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "section-container" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "block section-heading icon icon-device-desktop" }, "URI Handling"), /* @__PURE__ */ import_etch.default.dom("div", { className: "text icon icon-question" }, "These settings determine how Chevron handles chevron:// URIs."), /* @__PURE__ */ import_etch.default.dom("div", { className: "section-body" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "control-group" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "controls" }, /* @__PURE__ */ import_etch.default.dom("label", { className: "control-label" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "setting-title" }, "URI Handler Registration"), /* @__PURE__ */ import_etch.default.dom("div", { className: "setting-description" }, this.renderRegistrationDescription())), /* @__PURE__ */ import_etch.default.dom(
      "button",
      {
        className: "btn btn-primary",
        disabled: !isSupported() || this.isDefaultProtocolClient,
        style: { fontSize: "1.25em", display: "block" },
        onClick: this.handleBecomeProtocolClient
      },
      "Register as default chevron:// protocol handler"
    ))), /* @__PURE__ */ import_etch.default.dom("div", { className: "control-group" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "controls" }, /* @__PURE__ */ import_etch.default.dom("label", { className: "control-label" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "setting-title" }, "Default Registration"), /* @__PURE__ */ import_etch.default.dom("div", { className: "setting-description" }, schema.description)), /* @__PURE__ */ import_etch.default.dom(
      "select",
      {
        id: "core.uriHandlerRegistration",
        className: "form-control",
        onChange: this.handleChange,
        value: chevron.config.get("core.uriHandlerRegistration")
      },
      schema.enum.map(({ description, value }) => /* @__PURE__ */ import_etch.default.dom("option", { value }, description))
    ))), /* @__PURE__ */ import_etch.default.dom("div", { className: "control-group" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "controls" }, /* @__PURE__ */ import_etch.default.dom("label", { className: "controls-label" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "setting-title" }, "Recent URIs")), /* @__PURE__ */ import_etch.default.dom("table", { className: "uri-history" }, /* @__PURE__ */ import_etch.default.dom("tr", null, /* @__PURE__ */ import_etch.default.dom("th", null, "URI"), /* @__PURE__ */ import_etch.default.dom("th", null, "Handled By")), this.uriHistory.map(this.renderHistoryRow.bind(this))))))))));
  }
  renderHistoryRow(item, idx) {
    return /* @__PURE__ */ import_etch.default.dom(
      "tr",
      {
        key: item.id,
        className: ""
      },
      /* @__PURE__ */ import_etch.default.dom("td", null, item.uri),
      /* @__PURE__ */ import_etch.default.dom("td", null, item.handled ? this.renderItem(item) : /* @__PURE__ */ import_etch.default.dom("em", null, "not handled"))
    );
  }
  renderItem(item) {
    if (item.host === "core") {
      return /* @__PURE__ */ import_etch.default.dom("em", null, "core");
    } else {
      return /* @__PURE__ */ import_etch.default.dom("a", { href: `chevron://config/packages/${item.host}`, onClick: this.handlePackageLinkClicked }, item.host);
    }
  }
  handlePackageLinkClicked(evt) {
    evt.preventDefault();
    chevron.workspace.open(evt.target.getAttribute("href"));
  }
  renderRegistrationDescription() {
    if (this.isDefaultProtocolClient) {
      return "Chevron is already the default handler for chevron:// URIs.";
    } else if (isSupported()) {
      return "Register Chevron as the default handler for chevron:// URIs.";
    } else {
      return "Registration as the default handler for chevron:// URIs is only supported on Windows and macOS.";
    }
  }
  handleChange(evt) {
    chevron.config.set("core.uriHandlerRegistration", evt.target.value);
  }
  handleBecomeProtocolClient(evt) {
    evt.preventDefault();
    if (setAsDefaultProtocolClient()) {
      this.isDefaultProtocolClient = isDefaultProtocolClient();
      import_etch.default.update(this);
    } else {
      chevron.notifications.addError("Could not become default protocol client");
    }
  }
  focus() {
    this.element.focus();
  }
  show() {
    this.element.style.display = "";
  }
  scrollUp() {
    this.element.scrollTop -= document.body.offsetHeight / 20;
  }
  scrollDown() {
    this.element.scrollTop += document.body.offsetHeight / 20;
  }
  pageUp() {
    this.element.scrollTop -= this.element.offsetHeight;
  }
  pageDown() {
    this.element.scrollTop += this.element.offsetHeight;
  }
  scrollToTop() {
    this.element.scrollTop = 0;
  }
  scrollToBottom() {
    this.element.scrollTop = this.element.scrollHeight;
  }
}
