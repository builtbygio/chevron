"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.source = void 0;

var _yubikiri = _interopRequireDefault(require("yubikiri"));

var _eventKit = require("event-kit");

var _graphqlClient = require("../graphql-client");

var _author = _interopRequireWildcard(require("./author"));

var _keytarStrategy = require("../shared/keytar-strategy");

var _modelObserver = _interopRequireDefault(require("./model-observer"));

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

// This is a guess about what a reasonable value is. Can adjust if performance is poor.
const MAX_COMMITS = 5000;
const source = {
  PENDING: Symbol('pending'),
  GITLOG: Symbol('git log'),
  GITHUBAPI: Symbol('github API')
};
exports.source = source;

class GraphQLCache {
  // One hour
  constructor() {
    this.bySlug = new Map();
  }

  get(remote) {
    const slug = remote.getSlug();
    const {
      ts,
      data
    } = this.bySlug.get(slug) || {
      ts: -Infinity,
      data: {}
    };

    if (Date.now() - ts > this.constructor.MAX_AGE_MS) {
      this.bySlug.delete(slug);
      return null;
    }

    return data;
  }

  set(remote, data) {
    this.bySlug.set(remote.getSlug(), {
      ts: Date.now(),
      data
    });
  }

}

_defineProperty(GraphQLCache, "MAX_AGE_MS", 3.6e6);

class UserStore {
  constructor({
    repository,
    login,
    config
  }) {
    this.emitter = new _eventKit.Emitter();
    this.subs = new _eventKit.CompositeDisposable(); // TODO: [ku 3/2018] Consider using Dexie (indexDB wrapper) like Desktop and persist users across sessions

    this.allUsers = new Map();
    this.excludedUsers = new Set();
    this.users = [];
    this.committer = _author.nullAuthor;
    this.last = {
      source: source.PENDING,
      repository: null,
      excludedUsers: this.excludedUsers
    };
    this.cache = new GraphQLCache();
    this.repositoryObserver = new _modelObserver.default({
      fetchData: r => (0, _yubikiri.default)({
        committer: r.getCommitter(),
        authors: r.getAuthors({
          max: MAX_COMMITS
        }),
        remotes: r.getRemotes()
      }),
      didUpdate: () => this.loadUsers()
    });
    this.repositoryObserver.setActiveModel(repository);
    this.loginObserver = new _modelObserver.default({
      didUpdate: () => this.loadUsers()
    });
    this.loginObserver.setActiveModel(login);
    this.subs.add(config.observe('github.excludedUsers', value => {
      this.excludedUsers = new Set((value || '').split(/\s*,\s*/).filter(each => each.length > 0));
      return this.loadUsers();
    }));
  }

  dispose() {
    this.subs.dispose();
    this.emitter.dispose();
  }

  async loadUsers() {
    const data = this.repositoryObserver.getActiveModelData();

    if (!data) {
      return;
    }

    this.setCommitter(data.committer);
    const githubRemotes = Array.from(data.remotes).filter(remote => remote.isGithubRepo());

    if (githubRemotes.length > 0) {
      await this.loadUsersFromGraphQL(githubRemotes);
    } else {
      this.addUsers(data.authors, source.GITLOG);
    } // if for whatever reason, no committers can be added, fall back to
    // using git log committers as the last resort


    if (this.allUsers.size === 0) {
      this.addUsers(data.authors, source.GITLOG);
    }
  }

  loadUsersFromGraphQL(remotes) {
    return Promise.all(Array.from(remotes, remote => this.loadMentionableUsers(remote)));
  }

  async getToken(loginModel, loginAccount) {
    if (!loginModel) {
      return null;
    }

    const token = await loginModel.getToken(loginAccount);

    if (token === _keytarStrategy.UNAUTHENTICATED || token === _keytarStrategy.INSUFFICIENT || token instanceof Error) {
      return null;
    }

    return token;
  }

  async loadMentionableUsers(remote) {
    const cached = this.cache.get(remote);

    if (cached !== null) {
      this.addUsers(cached, source.GITHUBAPI);
      return;
    }

    const endpoint = remote.getEndpoint();
    const token = await this.getToken(this.loginObserver.getActiveModel(), endpoint.getLoginAccount());

    if (!token) {
      return;
    }

    let hasMore = true;
    let cursor = null;
    const remoteUsers = [];

    while (hasMore) {
      const data = await (0, _graphqlClient.graphqlRequest)({
        url: endpoint.getGraphQLRoot(),
        token,
        query: `
          query GetMentionableUsers($owner: String!, $name: String!, $first: Int!, $after: String) {
            repository(owner: $owner, name: $name) {
              mentionableUsers(first: $first, after: $after) {
                nodes {
                  login
                  email
                  name
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        `,
        variables: {
          owner: remote.getOwner(),
          name: remote.getRepo(),
          first: 100,
          after: cursor
        }
      });

      if (!data || !data.repository) {
        break;
      }

      const connection = data.repository.mentionableUsers;
      const authors = connection.nodes.map(node => {
        if (node.email === '') {
          node.email = `${node.login}@users.noreply.github.com`;
        }

        return new _author.default(node.email, node.name, node.login);
      });
      this.addUsers(authors, source.GITHUBAPI);
      remoteUsers.push(...authors);
      cursor = connection.pageInfo.endCursor;
      hasMore = connection.pageInfo.hasNextPage;
    }

    this.cache.set(remote, remoteUsers);
  }

  addUsers(users, nextSource) {
    let changed = false;

    if (nextSource !== this.last.source || this.repositoryObserver.getActiveModel() !== this.last.repository || this.excludedUsers !== this.last.excludedUsers) {
      changed = true;
      this.allUsers.clear();
    }

    for (const author of users) {
      if (!this.allUsers.has(author.getEmail())) {
        changed = true;
      }

      this.allUsers.set(author.getEmail(), author);
    }

    if (changed) {
      this.finalize();
    }

    this.last.source = nextSource;
    this.last.repository = this.repositoryObserver.getActiveModel();
    this.last.excludedUsers = this.excludedUsers;
  }

  finalize() {
    // TODO: [ku 3/2018] consider sorting based on most recent authors or commit frequency
    const users = [];

    for (const author of this.allUsers.values()) {
      if (author.matches(this.committer)) {
        continue;
      }

      if (author.isNoReply()) {
        continue;
      }

      if (this.excludedUsers.has(author.getEmail())) {
        continue;
      }

      users.push(author);
    }

    users.sort(_author.default.compare);
    this.users = users;
    this.didUpdate();
  }

  setRepository(repository) {
    this.repositoryObserver.setActiveModel(repository);
  }

  setLoginModel(login) {
    this.loginObserver.setActiveModel(login);
  }

  setCommitter(committer) {
    const changed = !this.committer.matches(committer);
    this.committer = committer;

    if (changed) {
      this.finalize();
    }
  }

  didUpdate() {
    this.emitter.emit('did-update', this.getUsers());
  }

  onDidUpdate(callback) {
    return this.emitter.on('did-update', callback);
  }

  getUsers() {
    return this.users;
  }

}

exports.default = UserStore;