'use strict';

const {graphqlMutate} = require('../graphql-client');

module.exports = (auth, {reviewID, event}) =>
  graphqlMutate(auth, 'submitPrReviewMutation', {
    input: {
      event,
      pullRequestReviewId: reviewID
    }
  });
