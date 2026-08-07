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
var github_file_exports = {};
__export(github_file_exports, {
  default: () => GitHubFile
});
module.exports = __toCommonJS(github_file_exports);
var import_electron = require("electron");
var import_atom = require("atom");
var import_url = require("url");
var import_path = __toESM(require("path"));
class GitHubFile {
  // Public
  static fromPath(filePath) {
    return new GitHubFile(filePath);
  }
  constructor(filePath) {
    this.filePath = filePath;
    const [rootDir] = atom.project.relativizePath(this.filePath);
    if (rootDir != null) {
      const rootDirIndex = atom.project.getPaths().indexOf(rootDir);
      this.repo = atom.project.getRepositories()[rootDirIndex];
      this.type = "none";
      if (this.repo && this.gitURL()) {
        if (this.isGitHubWikiURL(this.githubRepoURL())) {
          this.type = "wiki";
        } else if (this.isGistURL(this.githubRepoURL())) {
          this.type = "gist";
        } else {
          this.type = "repo";
        }
      }
    }
  }
  // Public
  open(lineRange) {
    if (this.validateRepo()) {
      this.openURLInBrowser(this.blobURL() + this.getLineRangeSuffix(lineRange));
    }
  }
  // Public
  openOnMaster(lineRange) {
    if (this.validateRepo()) {
      this.openURLInBrowser(this.blobURLForMaster() + this.getLineRangeSuffix(lineRange));
    }
  }
  // Public
  blame(lineRange) {
    if (this.validateRepo()) {
      if (this.type === "repo") {
        this.openURLInBrowser(this.blameURL() + this.getLineRangeSuffix(lineRange));
      } else {
        atom.notifications.addWarning(`Blames do not exist for ${this.type}s`);
      }
    }
  }
  history() {
    if (this.validateRepo()) {
      this.openURLInBrowser(this.historyURL());
    }
  }
  copyURL(lineRange) {
    if (this.validateRepo()) {
      atom.clipboard.write(this.shaURL() + this.getLineRangeSuffix(lineRange));
    }
  }
  openBranchCompare() {
    if (this.validateRepo()) {
      if (this.type === "repo") {
        this.openURLInBrowser(this.branchCompareURL());
      } else {
        atom.notifications.addWarning(`Branches do not exist for ${this.type}s`);
      }
    }
  }
  openIssues() {
    if (this.validateRepo()) {
      if (this.type === "repo") {
        this.openURLInBrowser(this.issuesURL());
      } else {
        atom.notifications.addWarning(`Issues do not exist for ${this.type}s`);
      }
    }
  }
  openPullRequests() {
    if (this.validateRepo()) {
      if (this.type === "repo") {
        this.openURLInBrowser(this.pullRequestsURL());
      } else {
        atom.notifications.addWarning(`Pull requests do not exist for ${this.type}s`);
      }
    }
  }
  openRepository() {
    if (this.validateRepo()) {
      this.openURLInBrowser(this.githubRepoURL());
    }
  }
  getLineRangeSuffix(lineRange) {
    if (lineRange && this.type !== "wiki" && atom.config.get("open-on-github.includeLineNumbersInUrls")) {
      lineRange = import_atom.Range.fromObject(lineRange);
      const startRow = lineRange.start.row + 1;
      const endRow = lineRange.end.row + 1;
      if (startRow === endRow) {
        if (this.type === "gist") {
          return `-L${startRow}`;
        } else {
          return `#L${startRow}`;
        }
      } else {
        if (this.type === "gist") {
          return `-L${startRow}-L${endRow}`;
        } else {
          return `#L${startRow}-L${endRow}`;
        }
      }
    } else {
      return "";
    }
  }
  // Internal
  validateRepo() {
    if (!this.repo) {
      atom.notifications.addWarning(`No repository found for path: ${this.filePath}.`);
      return false;
    } else if (!this.gitURL()) {
      atom.notifications.addWarning(`No URL defined for remote: ${this.remoteName()}`);
      return false;
    } else if (!this.githubRepoURL()) {
      atom.notifications.addWarning(`Remote URL is not hosted on GitHub: ${this.gitURL()}`);
      return false;
    }
    return true;
  }
  // Internal
  openURLInBrowser(url) {
    import_electron.shell.openExternal(url);
  }
  // Internal
  blobURL() {
    const gitHubRepoURL = this.githubRepoURL();
    const repoRelativePath = this.repoRelativePath();
    if (this.type === "wiki") {
      return `${gitHubRepoURL}/${this.extractFileName(repoRelativePath)}`;
    } else if (this.type === "gist") {
      return `${gitHubRepoURL}#file-${this.encodeSegments(repoRelativePath.replace(/\./g, "-"))}`;
    } else {
      return `${gitHubRepoURL}/blob/${this.remoteBranchName()}/${this.encodeSegments(repoRelativePath)}`;
    }
  }
  // Internal
  blobURLForMaster() {
    const gitHubRepoURL = this.githubRepoURL();
    if (this.type === "repo") {
      return `${gitHubRepoURL}/blob/master/${this.encodeSegments(this.repoRelativePath())}`;
    } else {
      return this.blobURL();
    }
  }
  // Internal
  shaURL() {
    const gitHubRepoURL = this.githubRepoURL();
    const encodedSHA = this.encodeSegments(this.sha());
    const repoRelativePath = this.repoRelativePath();
    if (this.type === "wiki") {
      return `${gitHubRepoURL}/${this.extractFileName(repoRelativePath)}/${encodedSHA}`;
    } else if (this.type === "gist") {
      return `${gitHubRepoURL}/${encodedSHA}#file-${this.encodeSegments(repoRelativePath.replace(/\./g, "-"))}`;
    } else {
      return `${gitHubRepoURL}/blob/${encodedSHA}/${this.encodeSegments(repoRelativePath)}`;
    }
  }
  // Internal
  blameURL() {
    return `${this.githubRepoURL()}/blame/${this.remoteBranchName()}/${this.encodeSegments(this.repoRelativePath())}`;
  }
  // Internal
  historyURL() {
    const gitHubRepoURL = this.githubRepoURL();
    if (this.type === "wiki") {
      return `${gitHubRepoURL}/${this.extractFileName(this.repoRelativePath())}/_history`;
    } else if (this.type === "gist") {
      return `${gitHubRepoURL}/revisions`;
    } else {
      return `${gitHubRepoURL}/commits/${this.remoteBranchName()}/${this.encodeSegments(this.repoRelativePath())}`;
    }
  }
  // Internal
  issuesURL() {
    return `${this.githubRepoURL()}/issues`;
  }
  // Internal
  pullRequestsURL() {
    return `${this.githubRepoURL()}/pulls`;
  }
  // Internal
  branchCompareURL() {
    return `${this.githubRepoURL()}/compare/${this.encodeSegments(this.branchName())}`;
  }
  encodeSegments(segments = "") {
    return segments.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  }
  // Internal
  extractFileName(relativePath = "") {
    return import_path.default.parse(relativePath).name;
  }
  // Internal
  gitURL() {
    const remoteName = this.remoteName();
    if (remoteName != null) {
      return this.repo.getConfigValue(`remote.${remoteName}.url`, this.filePath);
    } else {
      return this.repo.getConfigValue(`remote.origin.url`, this.filePath);
    }
  }
  // Internal
  githubRepoURL() {
    let url = this.gitURL();
    if (url.match(/git@[^:]+:/)) {
      url = url.replace(/^git@([^:]+):(.+)$/, (match, host, repoPath) => {
        repoPath = repoPath.replace(/^\/+/, "");
        return `https://${host}/${repoPath}`;
      });
    } else if (url.match(/^ssh:\/\/git@([^/]+)\//)) {
      url = `https://${url.substring(10)}`;
    } else if (url.match(/^git:\/\/[^/]+\//)) {
      url = `https${url.substring(3)}`;
    } else if (url.match(/^https?:\/\/\w+@/)) {
      url = url.replace(/^https?:\/\/\w+@/, "https://");
    }
    url = url.replace(/\.git$/, "").replace(/\/+$/, "");
    url = url.replace(/\.wiki$/, "/wiki");
    if (!this.isBitbucketURL(url)) {
      return url;
    }
  }
  isGistURL(url) {
    try {
      const { host } = (0, import_url.parse)(url);
      return host === "gist.github.com";
    } catch (error) {
      return false;
    }
  }
  isGitHubWikiURL(url) {
    return /\/wiki$/.test(url);
  }
  isBitbucketURL(url) {
    if (url.startsWith("git@bitbucket.org")) {
      return true;
    }
    try {
      const { host } = (0, import_url.parse)(url);
      return host === "bitbucket.org";
    } catch (error) {
      return false;
    }
  }
  // Internal
  repoRelativePath() {
    return this.repo.getRepo(this.filePath).relativize(this.filePath);
  }
  // Internal
  remoteName() {
    const gitConfigRemote = this.repo.getConfigValue("atom.open-on-github.remote", this.filePath);
    if (gitConfigRemote) {
      return gitConfigRemote;
    }
    const shortBranch = this.repo.getShortHead(this.filePath);
    if (!shortBranch) {
      return null;
    }
    const branchRemote = this.repo.getConfigValue(`branch.${shortBranch}.remote`, this.filePath);
    if (branchRemote && branchRemote.length > 0) {
      return branchRemote;
    }
    return null;
  }
  // Internal
  sha() {
    return this.repo.getReferenceTarget("HEAD", this.filePath);
  }
  // Internal
  branchName() {
    const shortBranch = this.repo.getShortHead(this.filePath);
    if (!shortBranch) {
      return null;
    }
    const branchMerge = this.repo.getConfigValue(`branch.${shortBranch}.merge`, this.filePath);
    if (!(branchMerge && branchMerge.length > 11)) {
      return shortBranch;
    }
    if (branchMerge.indexOf("refs/heads/") !== 0) {
      return shortBranch;
    }
    return branchMerge.substring(11);
  }
  // Internal
  remoteBranchName() {
    const gitConfigBranch = this.repo.getConfigValue("atom.open-on-github.branch", this.filePath);
    if (gitConfigBranch) {
      return gitConfigBranch;
    } else if (this.remoteName() != null) {
      return this.encodeSegments(this.branchName());
    } else {
      return "master";
    }
  }
}
