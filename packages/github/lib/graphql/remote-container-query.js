'use strict';

// Recovered from remoteContainerQuery
module.exports = `query remoteContainerQuery($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    id
    defaultBranchRef {
      prefix
      name
      id
    }
  }
}
`;
