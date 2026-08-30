'use strict';

const {graphqlMutate} = require('../graphql-client');

const MERGE_METHODS = new Set(['MERGE', 'SQUASH', 'REBASE']);

/**
 * Merge a pull request from the editor.
 *
 * `expectedHeadOid` is not optional in practice: without it GitHub merges
 * whatever the head is at the moment the request lands, so a push that arrives
 * between rendering the button and clicking it would be merged silently. With
 * it, the API rejects the merge instead.
 */
module.exports = (auth, {pullRequestID, headOid, mergeMethod = 'MERGE', commitHeadline, commitBody, authorEmail}) => {
  if (!pullRequestID) {
    return Promise.reject(new Error('mergePullRequest requires a pullRequestID'));
  }
  if (!headOid) {
    return Promise.reject(
      new Error(
        'mergePullRequest requires headOid; without it a concurrent push ' +
          'would be merged without review'
      )
    );
  }
  if (!MERGE_METHODS.has(mergeMethod)) {
    return Promise.reject(
      new Error(
        `unknown mergeMethod ${mergeMethod}; expected one of ${[...MERGE_METHODS].join(', ')}`
      )
    );
  }

  const input = {
    pullRequestId: pullRequestID,
    expectedHeadOid: headOid,
    mergeMethod
  };
  if (commitHeadline) input.commitHeadline = commitHeadline;
  if (commitBody) input.commitBody = commitBody;
  if (authorEmail) input.authorEmail = authorEmail;

  return graphqlMutate(auth, 'mergePullRequestMutation', {input});
};

module.exports.MERGE_METHODS = MERGE_METHODS;
