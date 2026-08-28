"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.BarePrStatusesView = void 0;

var _react = _interopRequireDefault(require("react"));


var _propTypes = _interopRequireDefault(require("prop-types"));

var _eventKit = require("event-kit");

var _helpers = require("../helpers");

var _prStatusContextView = require("./pr-status-context-view");

var _checkSuiteView = require("./check-suite-view");

var _buildStatus = require("../models/build-status");

var _octicon = _interopRequireDefault(require("../atom/octicon"));

var _statusDonutChart = _interopRequireDefault(require("./status-donut-chart"));

var _periodicRefresher = _interopRequireDefault(require("../periodic-refresher"));

var _propTypes2 = require("../prop-types");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class BarePrStatusesView extends _react.default.Component {
  constructor(props) {
    super(props);

    _defineProperty(this, "refresh", () => {
      this.props.relay.refetch({
        id: this.props.pullRequest.id
      }, null, () => this.emitter.emit('did-refetch'), {
        force: true
      });
    });

    _defineProperty(this, "renderWithChecks", result => {
      for (const err of result.errors) {
        // eslint-disable-next-line no-console
        console.error(err);
      }

      if (!this.getHeadCommit().status && result.suites.length === 0) {
        return null;
      }

      this.refresherOpts.interval = this.createIntervalCallback(result.suites);

      if (this.props.displayType === 'full') {
        return this.renderAsFull(result);
      } else {
        return this.renderAsCheck(result);
      }
    });

    _defineProperty(this, "onDidRefetch", cb => this.emitter.on('did-refetch', cb));

    this.emitter = new _eventKit.Emitter();
    this.refresherOpts = {
      interval: this.createIntervalCallback([]),
      getCurrentId: () => this.props.pullRequest.id,
      refresh: this.refresh,
      minimumIntervalPerId: this.constructor.MINIMUM_REFRESH_INTERVAL
    };
  }

  componentDidMount() {
    this.refresher = new _periodicRefresher.default(this.constructor, this.refresherOpts);
    this.refresher.start();
  }

  componentWillUnmount() {
    this.refresher.destroy();
  }

  render() {
    const headCommit = this.getHeadCommit();
    const suites = ((headCommit.checkSuites && headCommit.checkSuites.edges) || [])
      .map(edge => edge && edge.node)
      .filter(Boolean);
    const runsBySuite = new Map();
    for (const suite of suites) {
      const runs = ((suite.checkRuns && suite.checkRuns.edges) || [])
        .map(edge => edge && edge.node)
        .filter(Boolean);
      runsBySuite.set(suite, runs);
    }
    return this.renderWithChecks({
      errors: [],
      suites,
      runsBySuite
    });
  }

  renderAsCheck({
    runsBySuite
  }) {
    const summaryStatus = this.getSummaryBuildStatus(runsBySuite);
    return _react.default.createElement(_octicon.default, {
      icon: summaryStatus.icon,
      className: `github-PrStatuses--${summaryStatus.classSuffix}`
    });
  }

  renderAsFull({
    suites,
    runsBySuite
  }) {
    const status = this.getHeadCommit().status;
    const contexts = status ? status.contexts : [];
    const summaryStatus = this.getSummaryBuildStatus(runsBySuite);
    const detailStatuses = this.getDetailBuildStatuses(runsBySuite);
    return _react.default.createElement("div", {
      className: "github-PrStatuses"
    }, _react.default.createElement("div", {
      className: "github-PrStatuses-header"
    }, _react.default.createElement("div", {
      className: "github-PrStatuses-donut-chart"
    }, this.renderDonutChart(detailStatuses)), _react.default.createElement("div", {
      className: "github-PrStatuses-summary"
    }, this.summarySentence(summaryStatus, detailStatuses))), _react.default.createElement("ul", {
      className: "github-PrStatuses-list"
    }, contexts.map(context => _react.default.createElement(_prStatusContextView.BarePrStatusContextView, {
      key: context.id,
      context: context
    })), suites.map(suite => _react.default.createElement(_checkSuiteView.BareCheckSuiteView, {
      key: suite.id,
      checkSuite: suite,
      checkRuns: runsBySuite.get(suite),
      switchToIssueish: this.props.switchToIssueish
    }))));
  }

  renderDonutChart(detailStatuses) {
    const counts = this.countsFromStatuses(detailStatuses);
    return _react.default.createElement(_statusDonutChart.default, counts);
  }

  summarySentence(summaryStatus, detailStatuses) {
    if (this.isAllSucceeded(summaryStatus)) {
      return 'All checks succeeded';
    } else if (this.isAllFailed(detailStatuses)) {
      return 'All checks failed';
    } else {
      const noun = detailStatuses.length === 1 ? 'check' : 'checks';
      const parts = [];
      const {
        pending,
        failure,
        success
      } = this.countsFromStatuses(detailStatuses);

      if (pending > 0) {
        parts.push(`${pending} pending`);
      }

      if (failure > 0) {
        parts.push(`${failure} failing`);
      }

      if (success > 0) {
        parts.push(`${success} successful`);
      }

      return (0, _helpers.toSentence)(parts) + ` ${noun}`;
    }
  }

  countsFromStatuses(statuses) {
    const counts = {
      pending: 0,
      failure: 0,
      success: 0,
      neutral: 0
    };

    for (const buildStatus of statuses) {
      const count = counts[buildStatus.classSuffix];
      /* istanbul ignore else */

      if (count !== undefined) {
        counts[buildStatus.classSuffix] = count + 1;
      }
    }

    return counts;
  }

  getHeadCommit() {
    return this.props.pullRequest.recentCommits.edges[0].node.commit;
  }

  getSummaryBuildStatus(runsBySuite) {
    const contextStatus = (0, _buildStatus.buildStatusFromStatusContext)(this.getHeadCommit().status || {});
    const checkRunStatuses = [];

    for (const [, runs] of runsBySuite) {
      for (const checkRun of runs) {
        checkRunStatuses.push((0, _buildStatus.buildStatusFromCheckResult)(checkRun));
      }
    }

    return (0, _buildStatus.combineBuildStatuses)(contextStatus, ...checkRunStatuses);
  }

  getDetailBuildStatuses(runsBySuite) {
    const headCommit = this.getHeadCommit();
    const statuses = [];

    if (headCommit.status) {
      for (const context of headCommit.status.contexts) {
        statuses.push((0, _buildStatus.buildStatusFromStatusContext)(context));
      }
    }

    for (const [, checkRuns] of runsBySuite) {
      for (const checkRun of checkRuns) {
        statuses.push((0, _buildStatus.buildStatusFromCheckResult)(checkRun));
      }
    }

    return statuses;
  }

  createIntervalCallback(suites) {
    return () => {
      const statuses = [(0, _buildStatus.buildStatusFromStatusContext)(this.getHeadCommit().status || {}), ...suites.map(_buildStatus.buildStatusFromCheckResult)];

      if (statuses.some(status => status.classSuffix === 'pending')) {
        return this.constructor.PENDING_REFRESH_TIMEOUT;
      } else {
        return this.constructor.COMPLETED_REFRESH_TIMEOUT;
      }
    };
  }

  isAllSucceeded(buildStatuses) {
    return buildStatuses.classSuffix === 'success';
  }

  isAllFailed(detailStatuses) {
    return detailStatuses.every(s => s.classSuffix === 'failure');
  }

}

exports.BarePrStatusesView = BarePrStatusesView;

_defineProperty(BarePrStatusesView, "propTypes", {
  // Relay
  relay: _propTypes.default.shape({
    refetch: _propTypes.default.func.isRequired
  }).isRequired,
  pullRequest: _propTypes.default.shape({
    id: _propTypes.default.string.isRequired,
    recentCommits: (0, _propTypes2.RelayConnectionPropType)(_propTypes.default.shape({
      commit: _propTypes.default.shape({
        status: _propTypes.default.shape({
          state: _propTypes.default.string.isRequired,
          contexts: _propTypes.default.arrayOf(_propTypes.default.shape({
            id: _propTypes.default.string.isRequired
          }).isRequired).isRequired
        })
      }).isRequired
    }).isRequired).isRequired
  }).isRequired,
  // Control
  displayType: _propTypes.default.oneOf(['check', 'full']),
  // Action
  switchToIssueish: _propTypes.default.func.isRequired
});

_defineProperty(BarePrStatusesView, "defaultProps", {
  displayType: 'full'
});

_defineProperty(BarePrStatusesView, "lastRefreshPerPr", new Map());

_defineProperty(BarePrStatusesView, "COMPLETED_REFRESH_TIMEOUT", 3 * 60 * 1000);

_defineProperty(BarePrStatusesView, "PENDING_REFRESH_TIMEOUT", 30 * 1000);

_defineProperty(BarePrStatusesView, "MINIMUM_REFRESH_INTERVAL", 15 * 1000);


exports.default = BarePrStatusesView;