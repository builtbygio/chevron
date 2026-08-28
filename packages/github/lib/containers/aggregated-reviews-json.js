'use strict';

const React = require('react');
const PropTypes = require('prop-types');
const {graphqlRequest, resolveAuth} = require('../graphql-client');
const {loadRecovered} = require('../graphql/load-recovered');
const {PAGE_SIZE} = require('../helpers');

function edges(connection) {
  return ((connection && connection.edges) || [])
    .map(edge => edge && edge.node)
    .filter(Boolean);
}

function pageInfo(connection) {
  return (connection && connection.pageInfo) || {hasNextPage: false, endCursor: null};
}

/**
 * 8B: first page from the parent payload, then drain remaining
 * review/thread/comment pages via graphql-client.
 */
class AggregatedReviewsJson extends React.Component {
  constructor(props) {
    super(props);
    this.state = this.derive(props.pullRequest);
    this._seq = 0;
  }

  derive(pr) {
    const pullRequest = pr || {};
    return {
      summaries: edges(pullRequest.reviews),
      commentThreads: edges(pullRequest.reviewThreads).map(thread => ({
        thread,
        comments: edges(thread.comments),
        commentPage: pageInfo(thread.comments)
      })),
      reviewPage: pageInfo(pullRequest.reviews),
      threadPage: pageInfo(pullRequest.reviewThreads),
      loading: false
    };
  }

  componentDidMount() {
    this.drain();
  }

  componentDidUpdate(prev) {
    if (prev.pullRequest !== this.props.pullRequest && prev.refetch === this.props.refetch) {
      // Parent merge (timeline/commits) may pass a new PR object identity.
      // Only reset when the PR id changes or a full refetch replaced it.
    }
    if (
      prev.pullRequest &&
      this.props.pullRequest &&
      prev.pullRequest.id === this.props.pullRequest.id &&
      prev.pullRequest !== this.props.pullRequest &&
      !this.state.loading
    ) {
      const prevReviewCount = edges(prev.pullRequest.reviews).length;
      const nextReviewCount = edges(this.props.pullRequest.reviews).length;
      if (nextReviewCount < prevReviewCount || prev.refetch !== this.props.refetch) {
        this.setState(this.derive(this.props.pullRequest), () => this.drain());
      }
    } else if (prev.pullRequest !== this.props.pullRequest && !this.state.loading) {
      this.setState(this.derive(this.props.pullRequest), () => this.drain());
    }
  }

  async drain() {
    if (!this.props.endpoint || !this.props.token) return;
    const seq = ++this._seq;
    this.setState({loading: true});
    try {
      await this.drainReviews(seq);
      await this.drainThreads(seq);
      await this.drainComments(seq);
    } catch (_err) {
      // Leave whatever pages we already have. Parent refetch still works.
    } finally {
      if (seq === this._seq) this.setState({loading: false});
    }
  }

  auth() {
    return resolveAuth({
      endpoint: this.props.endpoint,
      token: this.props.token
    });
  }

  prUrl() {
    return this.props.pullRequest && this.props.pullRequest.url;
  }

  async drainReviews(seq) {
    const url = this.prUrl();
    if (!url) return;
    let info = this.state.reviewPage;
    let summaries = this.state.summaries.slice();
    while (info.hasNextPage) {
      const {url: gql, token} = this.auth();
      const page = await graphqlRequest({
        url: gql,
        token,
        query: loadRecovered('reviewSummariesAccumulatorQuery'),
        variables: {
          url,
          reviewCount: PAGE_SIZE,
          reviewCursor: info.endCursor
        }
      });
      if (seq !== this._seq) return;
      const conn = page.resource && page.resource.reviews;
      summaries = summaries.concat(edges(conn));
      info = pageInfo(conn);
      this.setState({summaries, reviewPage: info});
    }
  }

  async drainThreads(seq) {
    const url = this.prUrl();
    if (!url) return;
    let info = this.state.threadPage;
    let commentThreads = this.state.commentThreads.slice();
    while (info.hasNextPage) {
      const {url: gql, token} = this.auth();
      const page = await graphqlRequest({
        url: gql,
        token,
        query: loadRecovered('reviewThreadsAccumulatorQuery'),
        variables: {
          url,
          threadCount: PAGE_SIZE,
          threadCursor: info.endCursor,
          commentCount: PAGE_SIZE
        }
      });
      if (seq !== this._seq) return;
      const conn = page.resource && page.resource.reviewThreads;
      const more = edges(conn).map(thread => ({
        thread,
        comments: edges(thread.comments),
        commentPage: pageInfo(thread.comments)
      }));
      commentThreads = commentThreads.concat(more);
      info = pageInfo(conn);
      this.setState({commentThreads, threadPage: info});
    }
  }

  async drainComments(seq) {
    const threads = this.state.commentThreads.slice();
    let changed = false;
    for (let i = 0; i < threads.length; i++) {
      let info = threads[i].commentPage;
      let comments = threads[i].comments.slice();
      const threadId = threads[i].thread && threads[i].thread.id;
      if (!threadId) continue;
      while (info.hasNextPage) {
        const {url: gql, token} = this.auth();
        const page = await graphqlRequest({
          url: gql,
          token,
          query: loadRecovered('reviewCommentsAccumulatorQuery'),
          variables: {
            id: threadId,
            commentCount: PAGE_SIZE,
            commentCursor: info.endCursor
          }
        });
        if (seq !== this._seq) return;
        const conn = page.node && page.node.comments;
        comments = comments.concat(edges(conn));
        info = pageInfo(conn);
        threads[i] = Object.assign({}, threads[i], {comments, commentPage: info});
        changed = true;
      }
    }
    if (changed) this.setState({commentThreads: threads});
  }

  render() {
    return this.props.children({
      errors: [],
      summaries: this.state.summaries,
      commentThreads: this.state.commentThreads.map(({thread, comments}) => ({
        thread,
        comments
      })),
      loading: this.state.loading,
      refetch: this.props.refetch || (() => {})
    });
  }
}

AggregatedReviewsJson.propTypes = {
  pullRequest: PropTypes.shape({
    id: PropTypes.string,
    url: PropTypes.string
  }),
  endpoint: PropTypes.object,
  token: PropTypes.string,
  refetch: PropTypes.func,
  children: PropTypes.func.isRequired
};

module.exports = AggregatedReviewsJson;
