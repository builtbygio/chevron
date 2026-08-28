'use strict';

// Recovered from lib/items/__generated__/issueishTooltipItemQuery.graphql.js
module.exports = `query issueishTooltipItemQuery($issueishUrl: URI!) {
  resource(url: $issueishUrl) {
    __typename
    ... on Node { id }
    ... on Issue {
      state
      number
      title
      repository {
        name
        owner { __typename login id }
        id
      }
      author {
        __typename
        login
        avatarUrl
        ... on Node { id }
      }
    }
    ... on PullRequest {
      state
      number
      title
      repository {
        name
        owner { __typename login id }
        id
      }
      author {
        __typename
        login
        avatarUrl
        ... on Node { id }
      }
    }
  }
}
`;
