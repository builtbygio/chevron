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
var settings_panel_exports = {};
__export(settings_panel_exports, {
  default: () => SettingsPanel
});
module.exports = __toCommonJS(settings_panel_exports);
var import_atom = require("chevron");
var import_underscore_plus = __toESM(require("underscore-plus"));
var import_collapsible_section_panel = __toESM(require("./collapsible-section-panel"));
var import_rich_description = require("./rich-description");
const SCOPED_SETTINGS = [
  "autoIndent",
  "autoIndentOnPaste",
  "invisibles",
  "nonWordCharacters",
  "preferredLineLength",
  "scrollPastEnd",
  "showIndentGuide",
  "showInvisibles",
  "softWrap",
  "softWrapAtPreferredLineLength",
  "softWrapHangingIndent",
  "tabLength",
  "tabType"
];
class SettingsPanel extends import_collapsible_section_panel.default {
  constructor(options = {}) {
    super();
    let namespace = options.namespace;
    this.element = document.createElement("section");
    this.element.classList.add("section", "settings-panel");
    this.options = options;
    this.disposables = new import_atom.CompositeDisposable();
    let settings;
    if (this.options.scopeName) {
      namespace = "editor";
      settings = {};
      for (const name of SCOPED_SETTINGS) {
        settings[name] = chevron.config.get(name, { scope: [this.options.scopeName] });
      }
    } else {
      settings = chevron.config.get(namespace);
    }
    this.element.appendChild(this.elementForSettings(namespace, settings));
    this.disposables.add(this.bindInputFields());
    this.disposables.add(this.bindSelectFields());
    this.disposables.add(this.bindEditors());
    this.disposables.add(this.bindTooltips());
    this.disposables.add(this.handleEvents());
  }
  destroy() {
    this.disposables.dispose();
    this.element.remove();
  }
  elementForSettings(namespace, settings) {
    if (import_underscore_plus.default.isEmpty(settings)) {
      return document.createDocumentFragment();
    }
    let { title } = this.options;
    const includeTitle = this.options.includeTitle != null ? this.options.includeTitle : true;
    if (includeTitle) {
      if (title == null) {
        title = `${import_underscore_plus.default.undasherize(import_underscore_plus.default.uncamelcase(namespace))} Settings`;
      }
    } else {
      if (title == null) {
        title = "Settings";
      }
    }
    const icon = this.options.icon != null ? this.options.icon : "gear";
    const { note } = this.options;
    const sortedSettings = this.sortSettings(namespace, settings);
    const container = document.createElement("div");
    container.classList.add("section-container");
    const heading = document.createElement("div");
    heading.classList.add("block", "section-heading", "icon", `icon-${icon}`);
    heading.textContent = title;
    container.appendChild(heading);
    if (note) {
      container.insertAdjacentHTML("beforeend", note);
    }
    const body = document.createElement("div");
    body.classList.add("section-body");
    for (const name of sortedSettings) {
      body.appendChild(elementForSetting(namespace, name, settings[name]));
    }
    container.appendChild(body);
    return container;
  }
  sortSettings(namespace, settings) {
    return sortSettings(namespace, settings);
  }
  bindInputFields() {
    const disposables = Array.from(this.element.querySelectorAll("input[id]")).map((input) => {
      let type = input.type;
      let name = type === "radio" ? input.name : input.id;
      this.observe(name, (value) => {
        if (type === "checkbox") {
          input.checked = value;
        } else if (type === "radio") {
          input.checked = value === this.parseValue(chevron.config.getSchema(name).type, input.value);
        } else {
          if (type === "color") {
            if (value && value.toHexString && value.toHexString()) {
              value = value.toHexString();
            }
          }
          if (value) {
            input.value = value;
          }
        }
      });
      const changeHandler = () => {
        let value = input.value;
        if (type === "checkbox") {
          value = input.checked;
        } else if (type === "radio") {
          value = this.parseValue(chevron.config.getSchema(name).type, value);
        } else {
          value = this.parseValue(type, value);
        }
        if (type === "color") {
          clearTimeout(this.colorDebounceTimeout);
          this.colorDebounceTimeout = setTimeout(() => {
            this.set(name, value);
          }, 100);
        } else {
          this.set(name, value);
        }
      };
      input.addEventListener("change", changeHandler);
      return new import_atom.Disposable(() => input.removeEventListener("change", changeHandler));
    });
    return new import_atom.CompositeDisposable(...disposables);
  }
  observe(name, callback) {
    let params = { sources: [chevron.config.getUserConfigPath()] };
    if (this.options.scopeName != null) {
      params.scope = [this.options.scopeName];
    }
    this.disposables.add(chevron.config.observe(name, params, callback));
  }
  isDefault(name) {
    let params = { sources: [chevron.config.getUserConfigPath()] };
    if (this.options.scopeName != null) {
      params.scope = [this.options.scopeName];
    }
    let defaultValue = this.getDefault(name);
    let value = chevron.config.get(name, params);
    return value == null || defaultValue === value;
  }
  getDefault(name) {
    let params = { excludeSources: [chevron.config.getUserConfigPath()] };
    if (this.options.scopeName != null) {
      params.scope = [this.options.scopeName];
    }
    let defaultValue = chevron.config.get(name, params);
    if (this.options.scopeName != null) {
      if (chevron.config.get(name, { excludeSources: [chevron.config.getUserConfigPath()] }) === defaultValue) {
        defaultValue = chevron.config.get(name);
      }
    }
    return defaultValue;
  }
  set(name, value) {
    if (this.options.scopeName) {
      if (value === void 0) {
        chevron.config.unset(name, { scopeSelector: this.options.scopeName });
        return true;
      } else {
        return chevron.config.set(name, value, { scopeSelector: this.options.scopeName });
      }
    } else {
      return chevron.config.set(name, value);
    }
  }
  setText(editor, name, type, value) {
    let stringValue;
    if (this.isDefault(name)) {
      stringValue = "";
    } else {
      stringValue = this.valueToString(value) || "";
    }
    if (stringValue === editor.getText() || import_underscore_plus.default.isEqual(value, this.parseValue(type, editor.getText()))) {
      return;
    }
    editor.setText(stringValue);
    editor.moveToEndOfLine();
  }
  bindSelectFields() {
    const disposables = Array.from(this.element.querySelectorAll("select[id]")).map((select) => {
      const name = select.id;
      this.observe(name, (value) => {
        select.value = value;
      });
      const changeHandler = () => {
        this.set(name, select.value);
      };
      select.addEventListener("change", changeHandler);
      return new import_atom.Disposable(() => select.removeEventListener("change", changeHandler));
    });
    return new import_atom.CompositeDisposable(...disposables);
  }
  bindEditors() {
    const disposables = Array.from(this.element.querySelectorAll("atom-text-editor")).map((editorElement) => {
      let editor = editorElement.getModel();
      let name = editorElement.id;
      let type = editorElement.getAttribute("type");
      let defaultValue = this.valueToString(this.getDefault(name));
      if (defaultValue != null) {
        editor.setPlaceholderText(`Default: ${defaultValue}`);
      }
      const subscriptions = new import_atom.CompositeDisposable();
      const focusHandler = () => {
        if (this.isDefault(name)) {
          editor.setText(this.valueToString(this.getDefault(name)) || "");
        }
      };
      editorElement.addEventListener("focus", focusHandler);
      subscriptions.add(new import_atom.Disposable(() => editorElement.removeEventListener("focus", focusHandler)));
      const blurHandler = () => {
        if (this.isDefault(name)) {
          editor.setText("");
        }
      };
      editorElement.addEventListener("blur", blurHandler);
      subscriptions.add(new import_atom.Disposable(() => editorElement.removeEventListener("blur", blurHandler)));
      this.observe(name, (value) => {
        this.setText(editor, name, type, value);
      });
      subscriptions.add(editor.onDidStopChanging(() => {
        const { minimum, maximum } = chevron.config.getSchema(name);
        const value = this.parseValue(type, editor.getText());
        if (minimum != null && value < minimum) {
          this.set(name, minimum);
          this.setText(editor, name, type, minimum);
        } else if (maximum != null && value > maximum) {
          this.set(name, maximum);
          this.setText(editor, name, type, maximum);
        } else if (!this.set(name, value)) {
          this.setText(editor, name, type, chevron.config.get(name));
        }
      }));
      return subscriptions;
    });
    return new import_atom.CompositeDisposable(...disposables);
  }
  bindTooltips() {
    const disposables = Array.from(this.element.querySelectorAll("input[id], select[id], atom-text-editor[id]")).map((element) => {
      const schema = chevron.config.getSchema(element.id);
      let defaultValue = this.valueToString(this.getDefault(element.id));
      if (defaultValue != null) {
        if (schema.enum && import_underscore_plus.default.findWhere(schema.enum, { value: defaultValue })) {
          defaultValue = import_underscore_plus.default.findWhere(schema.enum, { value: defaultValue }).description;
        }
        return chevron.tooltips.add(element, {
          title: `Default: ${defaultValue}`,
          delay: { show: 100 },
          placement: "auto left"
        });
      } else {
        return new import_atom.Disposable(() => {
        });
      }
    });
    return new import_atom.CompositeDisposable(...disposables);
  }
  valueToString(value) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return null;
      }
      return value.map((val) => val.toString().replace(/,/g, "\\,")).join(", ");
    } else if (value != null) {
      return value.toString();
    } else {
      return null;
    }
  }
  parseValue(type, value) {
    if (value === "") {
      return void 0;
    } else if (type === "number") {
      let floatValue = parseFloat(value);
      if (isNaN(floatValue)) {
        return value;
      } else {
        return floatValue;
      }
    } else if (type === "integer") {
      let intValue = parseInt(value);
      if (isNaN(intValue)) {
        return value;
      } else {
        return intValue;
      }
    } else if (type === "array") {
      let arrayValue = (value || "").split(",");
      arrayValue = arrayValue.reduce((values, val) => {
        const last = values.length - 1;
        if (last >= 0 && values[last].endsWith("\\")) {
          values[last] = values[last].replace(/\\$/, ",") + val;
        } else {
          values.push(val);
        }
        return values;
      }, []);
      return arrayValue.filter((val) => val).map((val) => val.trim());
    } else {
      return value;
    }
  }
}
let isEditableArray = function(array) {
  for (let item of array) {
    if (!import_underscore_plus.default.isString(item)) {
      return false;
    }
  }
  return true;
};
function sortSettings(namespace, settings) {
  return import_underscore_plus.default.chain(settings).keys().sortBy((name) => name).sortBy((name) => {
    const schema = chevron.config.getSchema(`${namespace}.${name}`);
    return schema ? schema.order : null;
  }).value();
}
function elementForSetting(namespace, name, value) {
  if (namespace === "core") {
    if (name === "themes") {
      return document.createDocumentFragment();
    }
    if (name === "disabledPackages") {
      return document.createDocumentFragment();
    }
    if (name === "customFileTypes") {
      return document.createDocumentFragment();
    }
    if (name === "uriHandlerRegistration") {
      return document.createDocumentFragment();
    }
  }
  if (namespace === "editor") {
    if (["commentStart", "commentEnd", "increaseIndentPattern", "decreaseIndentPattern", "foldEndPattern"].includes(name)) {
      return document.createDocumentFragment();
    }
  }
  const controlGroup = document.createElement("div");
  controlGroup.classList.add("control-group");
  const controls = document.createElement("div");
  controls.classList.add("controls");
  controlGroup.appendChild(controls);
  let schema = chevron.config.getSchema(`${namespace}.${name}`);
  if (schema && schema.enum) {
    controls.appendChild(elementForOptions(namespace, name, value, { radio: schema.radio }));
  } else if (schema && schema.type === "color") {
    controls.appendChild(elementForColor(namespace, name, value));
  } else if (import_underscore_plus.default.isBoolean(value) || schema && schema.type === "boolean") {
    controls.appendChild(elementForCheckbox(namespace, name, value));
  } else if (import_underscore_plus.default.isArray(value) || schema && schema.type === "array") {
    if (isEditableArray(value)) {
      controls.appendChild(elementForArray(namespace, name, value));
    }
  } else if (import_underscore_plus.default.isObject(value) || schema && schema.type === "object") {
    controls.appendChild(elementForObject(namespace, name, value));
  } else {
    controls.appendChild(elementForEditor(namespace, name, value));
  }
  return controlGroup;
}
function getSettingTitle(keyPath, name) {
  if (name == null) {
    name = "";
  }
  const schema = chevron.config.getSchema(keyPath);
  const title = schema != null ? schema.title : null;
  return title || import_underscore_plus.default.uncamelcase(name).split(".").map(import_underscore_plus.default.capitalize).join(" ");
}
function elementForOptions(namespace, name, value, { radio = false }) {
  let keyPath = `${namespace}.${name}`;
  let schema = chevron.config.getSchema(keyPath);
  let options = schema && schema.enum ? schema.enum : [];
  const fragment = document.createDocumentFragment();
  const label = document.createElement("label");
  label.classList.add("control-label");
  const titleDiv = document.createElement("div");
  titleDiv.classList.add("setting-title");
  titleDiv.textContent = getSettingTitle(keyPath, name);
  label.appendChild(titleDiv);
  const descriptionDiv = document.createElement("div");
  descriptionDiv.classList.add("setting-description");
  descriptionDiv.innerHTML = (0, import_rich_description.getSettingDescription)(keyPath);
  label.appendChild(descriptionDiv);
  fragment.appendChild(label);
  fragment.appendChild(enumOptions(options, { keyPath, radio }));
  return fragment;
}
function elementForCheckbox(namespace, name, value) {
  let keyPath = `${namespace}.${name}`;
  const div = document.createElement("div");
  div.classList.add("checkbox");
  const label = document.createElement("label");
  label.for = keyPath;
  const input = document.createElement("input");
  input.id = keyPath;
  input.type = "checkbox";
  input.classList.add("input-checkbox");
  label.appendChild(input);
  const titleDiv = document.createElement("div");
  titleDiv.classList.add("setting-title");
  titleDiv.textContent = getSettingTitle(keyPath, name);
  label.appendChild(titleDiv);
  div.appendChild(label);
  const descriptionDiv = document.createElement("div");
  descriptionDiv.classList.add("setting-description");
  descriptionDiv.innerHTML = (0, import_rich_description.getSettingDescription)(keyPath);
  div.appendChild(descriptionDiv);
  return div;
}
function elementForColor(namespace, name, value) {
  let keyPath = `${namespace}.${name}`;
  const div = document.createElement("div");
  div.classList.add("color");
  const label = document.createElement("label");
  label.for = keyPath;
  const input = document.createElement("input");
  input.id = keyPath;
  input.type = "color";
  label.appendChild(input);
  const titleDiv = document.createElement("div");
  titleDiv.classList.add("setting-title");
  titleDiv.textContent = getSettingTitle(keyPath, name);
  label.appendChild(titleDiv);
  div.appendChild(label);
  const descriptionDiv = document.createElement("div");
  descriptionDiv.classList.add("setting-description");
  descriptionDiv.innerHTML = (0, import_rich_description.getSettingDescription)(keyPath);
  div.appendChild(descriptionDiv);
  return div;
}
function elementForEditor(namespace, name, value) {
  let keyPath = `${namespace}.${name}`;
  let type = import_underscore_plus.default.isNumber(value) ? "number" : "string";
  const fragment = document.createDocumentFragment();
  const label = document.createElement("label");
  label.classList.add("control-label");
  const titleDiv = document.createElement("div");
  titleDiv.classList.add("setting-title");
  titleDiv.textContent = getSettingTitle(keyPath, name);
  label.appendChild(titleDiv);
  const descriptionDiv = document.createElement("div");
  descriptionDiv.classList.add("setting-description");
  descriptionDiv.innerHTML = (0, import_rich_description.getSettingDescription)(keyPath);
  label.appendChild(descriptionDiv);
  fragment.appendChild(label);
  const controls = document.createElement("div");
  controls.classList.add("controls");
  const editorContainer = document.createElement("div");
  editorContainer.classList.add("editor-container");
  const editor = new import_atom.TextEditor({ mini: true });
  editor.element.id = keyPath;
  editor.element.setAttribute("type", type);
  editorContainer.appendChild(editor.element);
  controls.appendChild(editorContainer);
  fragment.appendChild(controls);
  return fragment;
}
function elementForArray(namespace, name, value) {
  let keyPath = `${namespace}.${name}`;
  const fragment = document.createDocumentFragment();
  const label = document.createElement("label");
  label.classList.add("control-label");
  const titleDiv = document.createElement("div");
  titleDiv.classList.add("setting-title");
  titleDiv.textContent = getSettingTitle(keyPath, name);
  label.appendChild(titleDiv);
  const descriptionDiv = document.createElement("div");
  descriptionDiv.classList.add("setting-description");
  descriptionDiv.innerHTML = (0, import_rich_description.getSettingDescription)(keyPath);
  label.appendChild(descriptionDiv);
  fragment.appendChild(label);
  const controls = document.createElement("div");
  controls.classList.add("controls");
  const editorContainer = document.createElement("div");
  editorContainer.classList.add("editor-container");
  const editor = new import_atom.TextEditor({ mini: true });
  editor.element.id = keyPath;
  editor.element.setAttribute("type", "array");
  editorContainer.appendChild(editor.element);
  controls.appendChild(editorContainer);
  fragment.appendChild(controls);
  return fragment;
}
function elementForObject(namespace, name, value) {
  if (import_underscore_plus.default.keys(value).length === 0) {
    return document.createDocumentFragment();
  } else {
    let keyPath = `${namespace}.${name}`;
    let schema = chevron.config.getSchema(keyPath);
    let isCollapsed = schema.collapsed === true;
    const section = document.createElement("section");
    section.classList.add("sub-section");
    if (isCollapsed) {
      section.classList.add("collapsed");
    }
    const h3 = document.createElement("h3");
    h3.classList.add("sub-section-heading", "has-items");
    h3.textContent = getSettingTitle(keyPath, name);
    section.appendChild(h3);
    const descriptionDiv = document.createElement("div");
    descriptionDiv.classList.add("setting-description");
    descriptionDiv.innerHTML = (0, import_rich_description.getSettingDescription)(keyPath);
    section.appendChild(descriptionDiv);
    const div = document.createElement("div");
    div.classList.add("sub-section-body");
    for (const key of sortSettings(keyPath, value)) {
      div.appendChild(elementForSetting(namespace, `${name}.${key}`, value[key]));
    }
    section.appendChild(div);
    return section;
  }
}
function enumOptions(options, { keyPath, radio }) {
  const containerTag = radio ? "fieldset" : "select";
  const container = document.createElement(containerTag);
  container.id = keyPath;
  const containerClass = radio ? "input-radio-group" : "form-control";
  container.classList.add(containerClass);
  const conversion = radio ? optionToRadio : optionToSelect;
  const optionElements = options.map((option) => conversion(option, keyPath));
  for (const optionElement of optionElements) {
    container.appendChild(optionElement);
  }
  return container;
}
function optionToRadio(option, keyPath) {
  const button = document.createElement("input");
  const label = document.createElement("label");
  label.classList.add("input-label");
  let value;
  let description = "";
  if (option.hasOwnProperty("value")) {
    value = option.value;
    description = option.description;
  } else {
    value = option;
    description = option;
  }
  button.classList.add("input-radio");
  button.id = `${keyPath}[${value}]`;
  button.name = keyPath;
  button.type = "radio";
  button.value = value;
  label.appendChild(button);
  label.appendChild(document.createTextNode(description));
  return label;
}
function optionToSelect(option, keyPath) {
  const optionElement = document.createElement("option");
  if (option.hasOwnProperty("value")) {
    optionElement.value = option.value;
    optionElement.textContent = option.description;
  } else {
    optionElement.value = option;
    optionElement.textContent = option;
  }
  return optionElement;
}
