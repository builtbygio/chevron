'use strict';

const {graphqlMutate} = require('../graphql-client');

module.exports = (auth, {body, event, pullRequestID}) => {
  const input = {pullRequestId: pullRequestID};
  if (body) input.body = body;
  if (event) input.event = event;
  return graphqlMutate(auth, 'addPrReviewMutation', {input});
};
