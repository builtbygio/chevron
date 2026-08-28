# github (Chevron)

`lib/` is **pre-transpiled CJS** (Babel 7 + Relay + React, Electron 43 targets).
There is no `atomTranspilers` field. Chevron packaging must not run a
host `npm install` of `@atom/babel7-transpiler` for this package.

Entry: `lib/index.js` (`module.exports` + `GithubPackage`).
Git workers: utilityProcess (Phase S).

## 8B (inbox stays)

- **0.37.0:** React 18.3 + `createRoot` (`lib/react-root.js`). Login copy points
  at a classic GitHub PAT (`repo`, `read:org`, `user:email`).
- **0.37.1:** Recovered GraphQL documents from `__generated__` comments
  (`graphql/recovered/`). Markdown hover tooltips (issue/PR + @mention) use
  `lib/graphql-client.js` + `GraphQLQuery` instead of Relay `QueryRenderer`.
- **0.37.2:** GitHub tab header (viewer) and remote repo lookup use
  `GraphQLQuery`.
- **0.37.3:** Open-PR search list and checked-out PR list use `GraphQLQuery`
  + `BareIssueishListController` (plain JSON, not Relay fragment refs).
- **0.37.4:** Issue/PR detail, reviews pane, comment decorations, and
  create-repo dialog use `GraphQLQuery` + first-page JSON + `Bare*` views.
  Load-more / refetch / reaction mutations are stubs (`lib/relay-stub.js`).
  Do not slim inbox views. `react-relay` / `graphql@14` stay for leftover
  mutation helpers.
- **0.37.5:** Mutations POST via `graphql-client` (`graphqlMutate`). Callers
  pass `{endpoint, token}`; `relay.environment` is not required. After a
  successful mutation the parent query retries. Load-more still stubs.
- **0.37.6:** Timeline, PR commits, create-dialog orgs, and remaining
  review/thread/comment pages load via `graphql-pager` / graphql-client.
  Status checks render first-page JSON (no Relay accumulator).
- **0.37.7:** `react-relay` and `relay-runtime` dropped. Fragment wrappers
  now re-export Bare* as default. Inbox GraphQL is graphql-client only.
- **0.37.8:** Login with GitHub via the Chevron GitHub App device flow.
  Set `github.oauthClientId` (or `CHEVRON_GITHUB_CLIENT_ID`) to the App
  client ID and enable Device Flow on the App. `ghu_` user tokens skip
  the classic `X-OAuth-Scopes` check. Classic PAT remains a fallback.
  See `docs/github-app.md`.
- **0.37.9:** `electron.remote` gone from directory-select and git-timings
  (ipc `atom-show-open-dialog` / `atom-show-save-dialog`).
