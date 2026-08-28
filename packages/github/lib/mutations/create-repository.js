'use strict';

const {graphqlMutate} = require('../graphql-client');

module.exports = (auth, {name, ownerID, visibility}) =>
  graphqlMutate(auth, 'createRepositoryMutation', {
    input: {
      name,
      ownerId: ownerID,
      visibility
    }
  });
