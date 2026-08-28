'use strict';

const React = require('react');
const PropTypes = require('prop-types');
const {graphqlRequest} = require('../graphql-client');

/**
 * 8B stand-in for Relay QueryRenderer. Auth from endpoint+token.
 */
class GraphQLQuery extends React.Component {
  constructor(props) {
    super(props);
    this.state = {error: null, data: null};
    this._seq = 0;
    this.retry = this.retry.bind(this);
    this.merge = this.merge.bind(this);
  }

  componentDidMount() {
    this.load();
  }

  componentDidUpdate(prev) {
    if (
      prev.query !== this.props.query ||
      prev.variables !== this.props.variables ||
      prev.token !== this.props.token ||
      prev.endpoint !== this.props.endpoint
    ) {
      this.load();
    }
  }

  resolveAuth() {
    if (this.props.endpoint && this.props.token) {
      return {
        url: this.props.endpoint.getGraphQLRoot(),
        token: this.props.token
      };
    }
    return null;
  }

  retry() {
    return this.load();
  }

  merge(updater) {
    this.setState(s => {
      if (!s.data) return s;
      return {data: updater(s.data)};
    });
  }

  async load() {
    const seq = ++this._seq;
    const auth = this.resolveAuth();
    if (!auth || !auth.token) {
      this.setState({
        error: new Error('Not authenticated for GraphQL'),
        data: null
      });
      return;
    }
    try {
      const data = await graphqlRequest({
        url: auth.url,
        token: auth.token,
        query: this.props.query,
        variables: this.props.variables
      });
      if (seq === this._seq) this.setState({error: null, data});
    } catch (error) {
      if (seq === this._seq) this.setState({error, data: null});
    }
  }

  render() {
    return this.props.render({
      error: this.state.error,
      data: this.state.data,
      retry: this.retry,
      merge: this.merge
    });
  }
}

GraphQLQuery.propTypes = {
  endpoint: PropTypes.object,
  token: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
  query: PropTypes.string.isRequired,
  variables: PropTypes.object,
  render: PropTypes.func.isRequired
};

module.exports = GraphQLQuery;
