'use strict';

// Recovered from lib/items/__generated__/userMentionTooltipItemQuery.graphql.js
module.exports = `query userMentionTooltipItemQuery($username: String!) {
  repositoryOwner(login: $username) {
    __typename
    id
    login
    avatarUrl
    repositories { totalCount }
    ... on User { company }
    ... on Organization {
      membersWithRole { totalCount }
    }
  }
}
`;