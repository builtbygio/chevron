'use strict';

const {graphqlMutate} = require('../graphql-client');

module.exports = (auth, {reviewId, reviewBody}) =>
  graphqlMutate(auth, 'updatePrReviewSummaryMutation', {
    input: {
      pullRequestReviewId: reviewId,
      body: reviewBody
    }
  });
