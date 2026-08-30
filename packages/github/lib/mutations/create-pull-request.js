'use strict';

const {graphqlMutate} = require('../graphql-client');

/**
 * Open a pull request from the editor.
 *
 * The existing "Create Pull Request" button in remote-controller pushes the
 * branch and then opens github.com/<owner>/<repo>/compare/<branch>?expand=1 in
 * a browser -- that is Atom's original behaviour, and it leaves the editor.
 * This is the API path, so the flow can stay in the editor.
 *
 * The branch still has to be pushed first: GitHub rejects a head ref it cannot
 * see. Callers own that ordering, as remote-controller already does.
 */
module.exports = (auth, {repositoryID, baseRefName, headRefName, title, body, draft = false, maintainerCanModify = true}) => {
  for (const [name, value] of [
    ['repositoryID', repositoryID],
    ['baseRefName', baseRefName],
    ['headRefName', headRefName],
    ['title', title]
  ]) {
    if (!value) {
      return Promise.reject(
        new Error(`createPullRequest requires ${name}`)
      );
    }
  }

  const input = {
    repositoryId: repositoryID,
    baseRefName,
    headRefName,
    title,
    draft,
    maintainerCanModify
  };
  if (body) input.body = body;

  return graphqlMutate(auth, 'createPullRequestMutation', {input});
};
