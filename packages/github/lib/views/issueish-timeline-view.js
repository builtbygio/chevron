"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.collectionRenderer = collectionRenderer;
exports.default = void 0;

var _react = _interopRequireDefault(require("react"));

var _propTypes = _interopRequireDefault(require("prop-types"));

var _propTypes2 = require("../prop-types");

var _helpers = require("../helpers");

var _octicon = _interopRequireDefault(require("../atom/octicon"));

var _commitsView = require("./timeline-items/commits-view.js");

var _issueCommentView = require("./timeline-items/issue-comment-view.js");

var _mergedEventView = require("./timeline-items/merged-event-view.js");

var _headRefForcePushedEventView = require("./timeline-items/head-ref-force-pushed-event-view.js");

var _crossReferencedEventsView = require("./timeline-items/cross-referenced-events-view.js");

var _commitCommentThreadView = require("./timeline-items/commit-comment-thread-view");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function collectionRenderer(Component, styleAsTimelineItem = true) {
  var _class, _temp;

  return _temp = _class = class GroupedComponent extends _react.default.Component {
    static getFragment(fragName, ...args) {
      const frag = fragName === 'nodes' ? 'item' : fragName;
      return Component.getFragment(frag, ...args);
    }

    constructor(props) {
      super(props);
      (0, _helpers.autobind)(this, 'renderNode');
    }

    render() {
      return _react.default.createElement("div", {
        className: styleAsTimelineItem ? 'timeline-item' : ''
      }, this.props.nodes.map(this.renderNode));
    }

    renderNode(node, i) {
      return _react.default.createElement(Component, {
        key: i,
        item: node,
        issueish: this.props.issueish,
        switchToIssueish: this.props.switchToIssueish
      });
    }

  }, _defineProperty(_class, "displayName", `Grouped(${Component.render ? Component.render.displayName : Component.displayName})`), _defineProperty(_class, "propTypes", {
    nodes: _propTypes.default.array.isRequired,
    issueish: _propTypes.default.object.isRequired,
    switchToIssueish: _propTypes.default.func.isRequired
  }), _temp;
}

const timelineItems = {
  PullRequestCommit: _commitsView.BareCommitsView,
  PullRequestCommitCommentThread: collectionRenderer(_commitCommentThreadView.BareCommitCommentThreadView, false),
  IssueComment: collectionRenderer(_issueCommentView.BareIssueCommentView, false),
  MergedEvent: collectionRenderer(_mergedEventView.BareMergedEventView),
  HeadRefForcePushedEvent: collectionRenderer(_headRefForcePushedEventView.BareHeadRefForcePushedEventView),
  CrossReferencedEvent: _crossReferencedEventsView.BareCrossReferencedEventsView
};
const TimelineConnectionPropType = (0, _propTypes2.RelayConnectionPropType)(_propTypes.default.shape({
  __typename: _propTypes.default.string.isRequired
})).isRequired;

class IssueishTimelineView extends _react.default.Component {
  constructor(props) {
    super(props);
    (0, _helpers.autobind)(this, 'loadMore');
  }

  loadMore() {
    this.props.relay.loadMore(10, () => {
      this.forceUpdate();
    });
    this.forceUpdate();
  }

  render() {
    const issueish = this.props.issue || this.props.pullRequest;
    const groupedEdges = this.groupEdges(issueish.timelineItems.edges);
    return _react.default.createElement("div", {
      className: "github-PrTimeline"
    }, groupedEdges.map(({
      type,
      edges
    }) => {
      const Component = timelineItems[type];
      const propsForCommits = {
        onBranch: this.props.onBranch,
        openCommit: this.props.openCommit
      };

      if (Component) {
        return _react.default.createElement(Component, _extends({
          key: `${type}-${edges[0].cursor}`,
          nodes: edges.map(e => e.node),
          issueish: issueish,
          switchToIssueish: this.props.switchToIssueish
        }, Component === _commitsView.BareCommitsView && propsForCommits));
      } else {
        // eslint-disable-next-line no-console
        console.warn(`unrecognized timeline event type: ${type}`);
        return null;
      }
    }), this.renderLoadMore());
  }

  renderLoadMore() {
    if (!this.props.relay.hasMore()) {
      return null;
    }

    return _react.default.createElement("div", {
      className: "github-PrTimeline-loadMore"
    }, _react.default.createElement("button", {
      className: "github-PrTimeline-loadMoreButton btn",
      onClick: this.loadMore
    }, this.props.relay.isLoading() ? _react.default.createElement(_octicon.default, {
      icon: "ellipsis"
    }) : 'Load More'));
  }

  groupEdges(edges) {
    let currentGroup;
    const groupedEdges = [];
    let lastEdgeType;
    edges.forEach(({
      node,
      cursor
    }) => {
      const currentEdgeType = node.__typename;

      if (currentEdgeType === lastEdgeType) {
        currentGroup.edges.push({
          node,
          cursor
        });
      } else {
        currentGroup = {
          type: currentEdgeType,
          edges: [{
            node,
            cursor
          }]
        };
        groupedEdges.push(currentGroup);
      }

      lastEdgeType = currentEdgeType;
    });
    return groupedEdges;
  }

}

exports.default = IssueishTimelineView;

_defineProperty(IssueishTimelineView, "propTypes", {
  switchToIssueish: _propTypes.default.func.isRequired,
  relay: _propTypes.default.shape({
    hasMore: _propTypes.default.func.isRequired,
    loadMore: _propTypes.default.func.isRequired,
    isLoading: _propTypes.default.func.isRequired
  }).isRequired,
  issue: _propTypes.default.shape({
    timelineItems: TimelineConnectionPropType
  }),
  pullRequest: _propTypes.default.shape({
    timelineItems: TimelineConnectionPropType
  }),
  onBranch: _propTypes.default.bool,
  openCommit: _propTypes.default.func
});

_defineProperty(IssueishTimelineView, "defaultProps", {
  onBranch: false,
  openCommit: () => {}
});