'use strict';

const {graphqlMutate} = require('../graphql-client');

module.exports = (auth, {threadID}) =>
  graphqlMutate(auth, 'unresolveReviewThreadMutation', {
    input: {threadId: threadID}
  });
