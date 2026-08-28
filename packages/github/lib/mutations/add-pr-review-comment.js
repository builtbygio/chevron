'use strict';

const {graphqlMutate} = require('../graphql-client');

module.exports = (auth, {body, inReplyTo, reviewID}) =>
  graphqlMutate(auth, 'addPrReviewCommentMutation', {
    input: {
      body,
      inReplyTo,
      pullRequestReviewId: reviewID
    }
  });
