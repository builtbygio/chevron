'use strict';

/**
 * Compiled stand-in for jasmine-node's failure-tree.coffee.
 * Chevron no longer transpiles Coffee at runtime (#62). jasmine-tagged →
 * jasmine-focused → jasmine-node/reporter requires this file.
 */

const path = require('path');
const _ = require('underscore');

let coffeestack;
try {
  coffeestack = require('coffeestack');
} catch (_) {
  coffeestack = { convertStackTrace: s => s };
}

const sourceMaps = {};

class FailureTree {
  constructor() {
    this.suites = [];
  }

  isEmpty() {
    return this.suites.length === 0;
  }

  add(spec) {
    const items = spec.results().items_;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.passed_ !== false) continue;

      const failurePath = [];
      let parent = spec.suite;
      while (parent) {
        failurePath.unshift(parent);
        parent = parent.parentSuite;
      }

      let parentSuite = this;
      for (let j = 0; j < failurePath.length; j++) {
        const failure = failurePath[j];
        if (!parentSuite.suites[failure.id]) {
          parentSuite.suites[failure.id] = {
            spec: failure,
            suites: [],
            specs: []
          };
        }
        parentSuite = parentSuite.suites[failure.id];
      }

      if (!parentSuite.specs[spec.id]) {
        parentSuite.specs[spec.id] = { spec, failures: [] };
      }
      parentSuite.specs[spec.id].failures.push(item);
      this.filterStackTrace(item);
    }
  }

  filterJasmineLines(stackTraceLines) {
    const jasminePattern = /^\s*at\s+.*\(?.*[\\/]jasmine(-[^\\/]*)?\.js:\d+:\d+\)?\s*$/;
    let index = 0;
    while (index < stackTraceLines.length) {
      if (jasminePattern.test(stackTraceLines[index])) {
        stackTraceLines.splice(index, 1);
      } else {
        index++;
      }
    }
  }

  filterTrailingTimersLine(stackTraceLines) {
    if (
      stackTraceLines.length &&
      /^(\s*at .* )\(timers\.js:\d+:\d+\)/.test(
        stackTraceLines[stackTraceLines.length - 1]
      )
    ) {
      stackTraceLines.pop();
    }
  }

  filterSetupLines(stackTraceLines) {
    let removeLine = false;
    let index = 0;
    while (index < stackTraceLines.length) {
      removeLine =
        removeLine ||
        /^\s*at Object\.jasmine\.executeSpecsInFolder/.test(
          stackTraceLines[index]
        );
      if (removeLine) {
        stackTraceLines.splice(index, 1);
      } else {
        index++;
      }
    }
  }

  filterFailureMessageLine(failure, stackTraceLines) {
    const errorLines = [];
    while (stackTraceLines.length > 0) {
      if (/^\s+at\s+.*\((.*):(\d+):(\d+)\)\s*$/.test(stackTraceLines[0])) {
        break;
      }
      errorLines.push(stackTraceLines.shift());
    }

    const stackTraceErrorMessage = errorLines.join('\n');
    const { message } = failure;
    if (
      stackTraceErrorMessage !== message &&
      stackTraceErrorMessage !== `Error: ${message}`
    ) {
      stackTraceLines.splice(0, 0, ...errorLines);
    }
  }

  filterOriginLine(failure, stackTraceLines) {
    if (stackTraceLines.length !== 1) return;
    const match = /^\s*at\s+((\[object Object\])|(null))\.<anonymous>\s+\((.*):(\d+):(\d+)\)\s*$/.exec(
      stackTraceLines[0]
    );
    if (!match) return;
    stackTraceLines.shift();
    const filePath = path.relative(process.cwd(), match[4]);
    failure.messageLine = `${filePath}:${match[5]}:${match[6]}`;
  }

  filterStackTrace(failure) {
    const stackTrace = failure.trace && failure.trace.stack;
    if (!stackTrace) return;

    let stackTraceLines = stackTrace.split('\n').filter(line => line);
    this.filterJasmineLines(stackTraceLines);
    this.filterTrailingTimersLine(stackTraceLines);
    this.filterSetupLines(stackTraceLines);
    const converted = coffeestack.convertStackTrace(
      stackTraceLines.join('\n'),
      sourceMaps
    );
    if (!converted) return;

    stackTraceLines = converted.split('\n').filter(line => line);
    this.filterFailureMessageLine(failure, stackTraceLines);
    this.filterOriginLine(failure, stackTraceLines);
    failure.filteredStackTrace = stackTraceLines.join('\n');
  }

  forEachSpec(node, callback, depth) {
    if (!node) return;
    if (depth == null) depth = 0;
    const { spec, suites, specs, failures } = node;
    if (failures) {
      callback(spec, null, depth);
      for (let i = 0; i < failures.length; i++) {
        callback(spec, failures[i], depth);
      }
    } else {
      callback(spec, null, depth);
      depth++;
      const children = _.compact(suites || []);
      for (let i = 0; i < children.length; i++) {
        this.forEachSpec(children[i], callback, depth);
      }
      const specChildren = _.compact(specs || []);
      for (let i = 0; i < specChildren.length; i++) {
        this.forEachSpec(specChildren[i], callback, depth);
      }
    }
  }

  forEach(callback) {
    const suites = _.compact(this.suites);
    for (let i = 0; i < suites.length; i++) {
      this.forEachSpec(suites[i], callback);
    }
  }
}

module.exports = FailureTree;
