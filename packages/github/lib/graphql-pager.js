'use strict';

const {graphqlRequest, resolveAuth} = require('./graphql-client');
const {loadRecovered} = require('./graphql/load-recovered');

function edgesOf(connection) {
  return ((connection && connection.edges) || []).filter(Boolean);
}

function pageInfoOf(connection) {
  return (connection && connection.pageInfo) || {hasNextPage: false, endCursor: null};
}

function setPath(obj, path, value) {
  if (path.length === 0) return value;
  const head = path[0];
  const rest = path.slice(1);
  const base = obj && typeof obj === 'object' ? obj : {};
  return Object.assign({}, base, {
    [head]: setPath(base[head], rest, value)
  });
}

function appendConnection(existing, incoming) {
  const prev = existing || {edges: [], pageInfo: {hasNextPage: false, endCursor: null}};
  const next = incoming || {edges: [], pageInfo: prev.pageInfo};
  return {
    pageInfo: next.pageInfo || prev.pageInfo,
    edges: edgesOf(prev).concat(edgesOf(next))
  };
}

/**
 * Relay-shaped pager. loadMore POSTs `queryName` and merge()s appended data
 * into the parent GraphQLQuery state so Bare* views re-render.
 */
function createGraphqlPager({
  auth,
  queryName,
  variables,
  cursorVar,
  getConnection,
  append,
  getData,
  merge,
  retry
}) {
  let loading = false;
  const pager = {
    environment: null,
    hasMore() {
      const data = typeof getData === 'function' ? getData() : null;
      if (!data) return false;
      return Boolean(pageInfoOf(getConnection(data)).hasNextPage);
    },
    isLoading() {
      return loading;
    },
    async loadMore(_n, cb) {
      const data = typeof getData === 'function' ? getData() : null;
      if (!data || loading || !pager.hasMore()) {
        if (typeof cb === 'function') cb();
        return;
      }
      loading = true;
      try {
        const info = pageInfoOf(getConnection(data));
        const vars = Object.assign({}, variables, {
          [cursorVar]: info.endCursor
        });
        const {url, token} = resolveAuth(auth);
        const page = await graphqlRequest({
          url,
          token,
          query: loadRecovered(queryName),
          variables: vars
        });
        if (typeof merge === 'function') {
          merge(prev => append(prev || data, page));
        }
      } finally {
        loading = false;
        if (typeof cb === 'function') cb();
      }
    },
    refetch(_vars, _cache, cb) {
      if (typeof retry === 'function') retry();
      if (typeof cb === 'function') cb();
    }
  };
  return pager;
}

module.exports = {
  createGraphqlPager,
  edgesOf,
  pageInfoOf,
  setPath,
  appendConnection
};
