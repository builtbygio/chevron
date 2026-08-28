'use strict';

/**
 * 8B: GraphQL HTTP client without Relay. Same endpoint + token as
 * RelayNetworkLayerManager. Inbox stays; migrate one surface at a time.
 */

function resolveAuth(auth) {
  if (!auth) {
    throw new Error('Not authenticated for GraphQL');
  }
  if (auth.url && auth.token) {
    return {url: auth.url, token: auth.token};
  }
  if (auth.endpoint && auth.token) {
    return {url: auth.endpoint.getGraphQLRoot(), token: auth.token};
  }
  throw new Error('Not authenticated for GraphQL');
}

async function graphqlMutate(auth, documentName, variables) {
  const {loadRecovered} = require('./graphql/load-recovered');
  const {url, token} = resolveAuth(auth);
  return graphqlRequest({
    url,
    token,
    query: loadRecovered(documentName),
    variables: variables || {}
  });
}

async function graphqlRequest({url, token, query, variables}) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `bearer ${token}`,
        Accept: 'application/vnd.github.antiope-preview+json'
      },
      body: JSON.stringify({query, variables: variables || {}})
    });
  } catch (e) {
    e.network = true;
    e.rawStack = e.stack;
    throw e;
  }

  if (response.status !== 200) {
    const e = new Error(`GraphQL API endpoint at ${url} returned ${response.status}`);
    e.response = response;
    e.responseText = await response.text();
    e.rawStack = e.stack;
    throw e;
  }

  const payload = await response.json();
  if (payload && payload.errors && payload.errors.length > 0) {
    const e = new Error(`GraphQL API endpoint at ${url} returned an error.`);
    e.response = response;
    e.errors = payload.errors;
    e.rawStack = e.stack;
    throw e;
  }
  return payload.data;
}

module.exports = {graphqlRequest, graphqlMutate, resolveAuth};
