'use strict';

/**
 * 8B: first-page-only stand-in for Relay pagination / refetch props.
 * Load-more is a no-op until a later slice pages via graphql-client.
 */
function createRelayStub(retry) {
  return {
    environment: null,
    hasMore() {
      return false;
    },
    isLoading() {
      return false;
    },
    loadMore(_n, cb) {
      if (typeof cb === 'function') cb();
    },
    refetch(_vars, _cache, cb) {
      if (typeof retry === 'function') retry();
      if (typeof cb === 'function') cb();
    }
  };
}

module.exports = {createRelayStub};
