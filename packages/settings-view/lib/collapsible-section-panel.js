var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var collapsible_section_panel_exports = {};
__export(collapsible_section_panel_exports, {
  default: () => CollapsibleSectionPanel
});
module.exports = __toCommonJS(collapsible_section_panel_exports);
var import_atom = require("chevron");
class CollapsibleSectionPanel {
  notHiddenCardsLength(sectionElement) {
    return sectionElement.querySelectorAll(".package-card:not(.hidden)").length;
  }
  updateSectionCount(headerElement, countElement, packageCount, totalCount) {
    if (totalCount != null) {
      countElement.textContent = `${packageCount}/${totalCount}`;
    } else {
      countElement.textContent = packageCount;
    }
    if (packageCount > 0) {
      headerElement.classList.add("has-items");
    }
  }
  updateSectionCounts() {
    this.resetSectionHasItems();
    const filterText = this.refs.filterEditor.getText();
    if (filterText === "") {
      this.updateUnfilteredSectionCounts();
    } else {
      this.updateFilteredSectionCounts();
    }
  }
  handleEvents() {
    const handler = (e) => {
      const target = e.target.closest(".sub-section .has-items");
      if (target) {
        target.parentNode.classList.toggle("collapsed");
      }
    };
    this.element.addEventListener("click", handler);
    return new import_atom.Disposable(() => this.element.removeEventListener("click", handler));
  }
  resetCollapsibleSections(headerSections) {
    for (const headerSection of headerSections) {
      this.resetCollapsibleSection(headerSection);
    }
  }
  resetCollapsibleSection(headerSection) {
    headerSection.classList.remove("has-items");
  }
}
