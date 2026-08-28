'use strict';

const {graphqlMutate} = require('../graphql-client');

module.exports = (auth, subjectId, content) =>
  graphqlMutate(auth, 'addReactionMutation', {
    input: {content, subjectId}
  });
