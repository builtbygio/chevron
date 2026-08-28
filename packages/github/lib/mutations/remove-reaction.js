'use strict';

const {graphqlMutate} = require('../graphql-client');

module.exports = (auth, subjectId, content) =>
  graphqlMutate(auth, 'removeReactionMutation', {
    input: {content, subjectId}
  });
