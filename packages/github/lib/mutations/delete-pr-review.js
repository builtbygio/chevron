'use strict';

const {graphqlMutate} = require('../graphql-client');

module.exports = (auth, {reviewID}) =>
  graphqlMutate(auth, 'deletePrReviewMutation', {
    input: {pullRequestReviewId: reviewID}
  });
