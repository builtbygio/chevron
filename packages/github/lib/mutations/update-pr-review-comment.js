'use strict';

const {graphqlMutate} = require('../graphql-client');

module.exports = (auth, {commentId, commentBody}) =>
  graphqlMutate(auth, 'updatePrReviewCommentMutation', {
    input: {
      pullRequestReviewCommentId: commentId,
      body: commentBody
    }
  });
