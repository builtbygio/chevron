'use strict';

const {graphqlMutate} = require('../graphql-client');

module.exports = (auth, {threadID}) =>
  graphqlMutate(auth, 'resolveReviewThreadMutation', {
    input: {threadId: threadID}
  });
