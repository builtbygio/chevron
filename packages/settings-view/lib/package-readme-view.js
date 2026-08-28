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
var package_readme_view_exports = {};
__export(package_readme_view_exports, {
  default: () => PackageReadmeView
});
module.exports = __toCommonJS(package_readme_view_exports);
var import_marked = __toESM(require("marked"));
var import_dompurify = __toESM(require("dompurify"));
function sanitize(html, readmeSrc) {
  const temporaryContainer = document.createElement("div");
  temporaryContainer.innerHTML = html;
  for (const checkbox of temporaryContainer.querySelectorAll('input[type="checkbox"]')) {
    checkbox.setAttribute("disabled", "");
  }
  let path = require("path");
  for (const image of temporaryContainer.querySelectorAll("img")) {
    let imageSrc = image.getAttribute("src");
    let changeImageSrc = true;
    if (/^(?:[a-z]+:)?\/\//i.test(imageSrc)) {
      changeImageSrc = false;
    }
    if (/^data:image\/.*;base64/i.test(imageSrc)) {
      changeImageSrc = false;
    }
    if (path.isAbsolute(imageSrc)) {
      changeImageSrc = false;
    }
    if (changeImageSrc && readmeSrc) {
      if (path.isAbsolute(readmeSrc)) {
        image.setAttribute("src", path.join(readmeSrc, imageSrc));
      } else {
        image.setAttribute("src", new URL(imageSrc, readmeSrc));
      }
    }
  }
  return (0, import_dompurify.default)().sanitize(temporaryContainer.innerHTML);
}
class PackageReadmeView {
  constructor(readme, readmeSrc) {
    this.element = document.createElement("section");
    this.element.classList.add("section");
    const container = document.createElement("div");
    container.classList.add("section-container");
    const heading = document.createElement("div");
    heading.classList.add("section-heading", "icon", "icon-book");
    heading.textContent = "README";
    container.appendChild(heading);
    this.packageReadme = document.createElement("div");
    this.packageReadme.classList.add("package-readme", "native-key-bindings");
    this.packageReadme.tabIndex = -1;
    container.appendChild(this.packageReadme);
    this.element.appendChild(container);
    try {
      const parse = import_marked.parse || import_marked.marked;
      const content = parse(readme || "### No README.", { breaks: false });
      this.packageReadme.innerHTML = sanitize(content, readmeSrc);
    } catch (err) {
      this.packageReadme.innerHTML = "<h3>Error parsing README</h3>";
    }
  }
  destroy() {
    this.element.remove();
  }
}
