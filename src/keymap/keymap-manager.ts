(function() {
  var CommandEvent, CompositeDisposable, Disposable, Emitter, File, KeyBinding, KeymapManager, MATCH_TYPES, OtherPlatforms, PartialKeyupMatcher, Platforms, characterForKeyboardEvent, fs, isDirectorySync, isFileSync, listJsonSync, readKeymapFile, isBareModifier, isKeyup, isSelectorValid, keydownEvent, keystrokeForKeyboardEvent, keystrokesMatch, keyupEvent, normalizeKeystrokes, path, _ref, _ref1, _ref2,
    __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  fs = require('fs');

  isSelectorValid = require('clear-cut').isSelectorValid;

  path = require('path');

  // fs-plus provided these three; node:fs does not. Keymaps are the only
  // caller here, so they are defined locally rather than pulling in a
  // utility package for three predicates.
  isDirectorySync = function(candidate) {
    try {
      return fs.statSync(candidate).isDirectory();
    } catch (error) {
      return false;
    }
  };

  isFileSync = function(candidate) {
    try {
      return fs.statSync(candidate).isFile();
    } catch (error) {
      return false;
    }
  };

  // fs-plus listSync(dir, extensions) returned absolute paths, sorted. Only
  // .json now: CSON is no longer read anywhere in the product.
  listJsonSync = function(directory) {
    var entries;
    try {
      entries = fs.readdirSync(directory);
    } catch (error) {
      return [];
    }
    return entries
      .filter(function(entry) { return path.extname(entry) === '.json'; })
      .sort()
      .map(function(entry) { return path.join(directory, entry); });
  };

  File = require('./watched-file');

  readKeymapFile = require('./read-keymap-file').readKeymapFile;

  _ref = require('event-kit'), Emitter = _ref.Emitter, Disposable = _ref.Disposable, CompositeDisposable = _ref.CompositeDisposable;

  _ref1 = require('./key-binding'), KeyBinding = _ref1.KeyBinding, MATCH_TYPES = _ref1.MATCH_TYPES;

  CommandEvent = require('./command-event');

  _ref2 = require('./helpers'), normalizeKeystrokes = _ref2.normalizeKeystrokes, keystrokeForKeyboardEvent = _ref2.keystrokeForKeyboardEvent, isBareModifier = _ref2.isBareModifier, keydownEvent = _ref2.keydownEvent, keyupEvent = _ref2.keyupEvent, characterForKeyboardEvent = _ref2.characterForKeyboardEvent, keystrokesMatch = _ref2.keystrokesMatch, isKeyup = _ref2.isKeyup;

  PartialKeyupMatcher = require('./partial-keyup-matcher');

  Platforms = ['darwin', 'freebsd', 'linux', 'sunos', 'win32'];

  OtherPlatforms = Platforms.filter(function(platform) {
    return platform !== process.platform;
  });

  module.exports = KeymapManager = (function() {

    /*
    Section: Class Methods
     */
    KeymapManager.buildKeydownEvent = function(key, options) {
      return keydownEvent(key, options);
    };

    KeymapManager.buildKeyupEvent = function(key, options) {
      return keyupEvent(key, options);
    };


    /*
    Section: Properties
     */

    KeymapManager.prototype.partialMatchTimeout = 1000;

    KeymapManager.prototype.defaultTarget = null;

    KeymapManager.prototype.pendingPartialMatches = null;

    KeymapManager.prototype.pendingStateTimeoutHandle = null;

    KeymapManager.prototype.pendingKeyupMatcher = new PartialKeyupMatcher();


    /*
    Section: Construction and Destruction
     */

    function KeymapManager(options) {
      var key, value;
      if (options == null) {
        options = {};
      }
      for (key in options) {
        value = options[key];
        this[key] = value;
      }
      this.watchSubscriptions = {};
      this.customKeystrokeResolvers = [];
      this.clear();
    }

    KeymapManager.prototype.clear = function() {
      this.emitter = new Emitter;
      this.keyBindings = [];
      this.queuedKeyboardEvents = [];
      this.queuedKeystrokes = [];
      return this.bindingsToDisable = [];
    };

    KeymapManager.prototype.destroy = function() {
      var filePath, subscription, _ref3;
      _ref3 = this.watchSubscriptions;
      for (filePath in _ref3) {
        subscription = _ref3[filePath];
        subscription.dispose();
      }
    };


    /*
    Section: Event Subscription
     */

    KeymapManager.prototype.onDidMatchBinding = function(callback) {
      return this.emitter.on('did-match-binding', callback);
    };

    KeymapManager.prototype.onDidPartiallyMatchBindings = function(callback) {
      return this.emitter.on('did-partially-match-binding', callback);
    };

    KeymapManager.prototype.onDidFailToMatchBinding = function(callback) {
      return this.emitter.on('did-fail-to-match-binding', callback);
    };

    KeymapManager.prototype.onDidReloadKeymap = function(callback) {
      return this.emitter.on('did-reload-keymap', callback);
    };

    KeymapManager.prototype.onDidUnloadKeymap = function(callback) {
      return this.emitter.on('did-unload-keymap', callback);
    };

    KeymapManager.prototype.onDidFailToReadFile = function(callback) {
      return this.emitter.on('did-fail-to-read-file', callback);
    };


    /*
    Section: Adding and Removing Bindings
     */

    KeymapManager.prototype.build = function(source, keyBindingsBySelector, priority, throwOnInvalidSelector) {
      var bindings, command, keyBindings, keystrokes, normalizedKeystrokes, selector, _ref3;
      if (priority == null) {
        priority = 0;
      }
      if (throwOnInvalidSelector == null) {
        throwOnInvalidSelector = true;
      }
      bindings = [];
      for (selector in keyBindingsBySelector) {
        keyBindings = keyBindingsBySelector[selector];
        if (throwOnInvalidSelector && !isSelectorValid(selector.replace(/!important/g, ''))) {
          console.warn("Encountered an invalid selector adding key bindings from '" + source + "': '" + selector + "'");
          continue;
        }
        if (typeof keyBindings !== 'object') {
          console.warn("Encountered an invalid key binding when adding key bindings from '" + source + "' '" + keyBindings + "'");
          continue;
        }
        for (keystrokes in keyBindings) {
          command = keyBindings[keystrokes];
          command = (_ref3 = command != null ? typeof command.toString === "function" ? command.toString() : void 0 : void 0) != null ? _ref3 : '';
          if (command.length === 0) {
            console.warn("Empty command for binding: `" + selector + "` `" + keystrokes + "` in " + source);
            continue;
          }
          if (normalizedKeystrokes = normalizeKeystrokes(keystrokes)) {
            bindings.push(new KeyBinding(source, command, normalizedKeystrokes, selector, priority));
          } else {
            console.warn("Invalid keystroke sequence for binding: `" + keystrokes + ": " + command + "` in " + source);
          }
        }
      }
      return bindings;
    };

    KeymapManager.prototype.add = function(source, keyBindingsBySelector, priority, throwOnInvalidSelector) {
      var addedKeyBindings, _ref3;
      if (priority == null) {
        priority = 0;
      }
      if (throwOnInvalidSelector == null) {
        throwOnInvalidSelector = true;
      }
      addedKeyBindings = this.build(source, keyBindingsBySelector, priority, throwOnInvalidSelector);
      (_ref3 = this.keyBindings).push.apply(_ref3, addedKeyBindings);
      return new Disposable((function(_this) {
        return function() {
          var index, keyBinding, _i, _len;
          for (_i = 0, _len = addedKeyBindings.length; _i < _len; _i++) {
            keyBinding = addedKeyBindings[_i];
            index = _this.keyBindings.indexOf(keyBinding);
            if (index !== -1) {
              _this.keyBindings.splice(index, 1);
            }
          }
        };
      })(this));
    };

    KeymapManager.prototype.removeBindingsFromSource = function(source) {
      this.keyBindings = this.keyBindings.filter(function(keyBinding) {
        return keyBinding.source !== source;
      });
      return void 0;
    };


    /*
    Section: Accessing Bindings
     */

    KeymapManager.prototype.getKeyBindings = function() {
      return this.keyBindings.slice();
    };

    KeymapManager.prototype.findKeyBindings = function(params) {
      var bindings, candidateBindings, command, element, keyBindings, keystrokes, matchingBindings, target;
      if (params == null) {
        params = {};
      }
      keystrokes = params.keystrokes, command = params.command, target = params.target, keyBindings = params.keyBindings;
      bindings = keyBindings != null ? keyBindings : this.keyBindings;
      if (command != null) {
        bindings = bindings.filter(function(binding) {
          return binding.command === command;
        });
      }
      if (keystrokes != null) {
        bindings = bindings.filter(function(binding) {
          return binding.keystrokes === keystrokes;
        });
      }
      if (target != null) {
        candidateBindings = bindings;
        bindings = [];
        element = target;
        while ((element != null) && element !== document) {
          matchingBindings = candidateBindings.filter(function(binding) {
            return element.webkitMatchesSelector(binding.selector);
          }).sort(function(a, b) {
            return a.compare(b);
          });
          bindings.push.apply(bindings, matchingBindings);
          element = element.parentElement;
        }
      }
      return bindings;
    };


    /*
    Section: Managing Keymap Files
     */

    KeymapManager.prototype.loadKeymap = function(bindingsPath, options) {
      var checkIfDirectory, filePath, _i, _len, _ref3, _ref4;
      checkIfDirectory = (_ref3 = options != null ? options.checkIfDirectory : void 0) != null ? _ref3 : true;
      if (checkIfDirectory && isDirectorySync(bindingsPath)) {
        _ref4 = listJsonSync(bindingsPath);
        for (_i = 0, _len = _ref4.length; _i < _len; _i++) {
          filePath = _ref4[_i];
          if (this.filePathMatchesPlatform(filePath)) {
            this.loadKeymap(filePath, {
              checkIfDirectory: false
            });
          }
        }
      } else {
        this.add(bindingsPath, this.readKeymap(bindingsPath, options != null ? options.suppressErrors : void 0), options != null ? options.priority : void 0);
        if (options != null ? options.watch : void 0) {
          this.watchKeymap(bindingsPath, options);
        }
      }
      return void 0;
    };

    KeymapManager.prototype.watchKeymap = function(filePath, options) {
      var file, reloadKeymap;
      if ((this.watchSubscriptions[filePath] == null) || this.watchSubscriptions[filePath].disposed) {
        file = new File(filePath);
        reloadKeymap = (function(_this) {
          return function() {
            return _this.reloadKeymap(filePath, options);
          };
        })(this);
        this.watchSubscriptions[filePath] = new CompositeDisposable(file.onDidChange(reloadKeymap), file.onDidRename(reloadKeymap), file.onDidDelete(reloadKeymap));
      }
      return void 0;
    };

    KeymapManager.prototype.reloadKeymap = function(filePath, options) {
      var bindings;
      if (isFileSync(filePath)) {
        bindings = this.readKeymap(filePath, true);
        if (typeof bindings !== "undefined") {
          this.removeBindingsFromSource(filePath);
          this.add(filePath, bindings, options != null ? options.priority : void 0);
          return this.emitter.emit('did-reload-keymap', {
            path: filePath
          });
        }
      } else {
        this.removeBindingsFromSource(filePath);
        return this.emitter.emit('did-unload-keymap', {
          path: filePath
        });
      }
    };

    KeymapManager.prototype.readKeymap = function(filePath, suppressErrors) {
      var error, _ref3;
      if (suppressErrors) {
        try {
          return readKeymapFile(filePath);
        } catch (_error) {
          error = _error;
          console.warn("Failed to reload key bindings file: " + filePath, (_ref3 = error.stack) != null ? _ref3 : error);
          this.emitter.emit('did-fail-to-read-file', error);
          return void 0;
        }
      } else {
        return readKeymapFile(filePath);
      }
    };

    KeymapManager.prototype.filePathMatchesPlatform = function(filePath) {
      var component, otherPlatforms, _i, _len, _ref3;
      otherPlatforms = this.getOtherPlatforms();
      _ref3 = path.basename(filePath).split('.').slice(0, -1);
      for (_i = 0, _len = _ref3.length; _i < _len; _i++) {
        component = _ref3[_i];
        if (__indexOf.call(otherPlatforms, component) >= 0) {
          return false;
        }
      }
      return true;
    };


    /*
    Section: Managing Keyboard Events
     */

    KeymapManager.prototype.handleKeyboardEvent = function(event, _arg) {
      var allPartialMatchesContainKeyupRemainder, binding, currentTarget, disabledBindings, dispatchedExactMatch, enableTimeout, eventHandled, exactMatchCandidate, exactMatchCandidates, exactMatches, hasPartialMatches, keystroke, keystrokes, liveMatches, partialMatch, partialMatchCandidates, partialMatches, pendingKeyupMatch, pendingKeyupMatchCandidates, replay, shouldUsePartialMatches, target, _i, _j, _k, _l, _len, _len1, _len2, _len3, _ref3, _ref4, _ref5;
      _ref3 = _arg != null ? _arg : {}, replay = _ref3.replay, disabledBindings = _ref3.disabledBindings;
      if (event.keyCode === 229 && event.key !== 'Dead') {
        return;
      }
      keystroke = this.keystrokeForKeyboardEvent(event);
      if (event.type === 'keydown' && this.queuedKeystrokes.length > 0 && isBareModifier(keystroke)) {
        event.preventDefault();
        return;
      }
      this.queuedKeystrokes.push(keystroke);
      this.queuedKeyboardEvents.push(event);
      keystrokes = this.queuedKeystrokes.join(' ');
      target = event.target;
      if (event.target === document.body && (this.defaultTarget != null)) {
        target = this.defaultTarget;
      }
      _ref4 = this.findMatchCandidates(this.queuedKeystrokes, disabledBindings), partialMatchCandidates = _ref4.partialMatchCandidates, pendingKeyupMatchCandidates = _ref4.pendingKeyupMatchCandidates, exactMatchCandidates = _ref4.exactMatchCandidates;
      dispatchedExactMatch = null;
      partialMatches = this.findPartialMatches(partialMatchCandidates, target);
      if (this.pendingPartialMatches != null) {
        liveMatches = new Set(partialMatches.concat(exactMatchCandidates));
        _ref5 = this.pendingPartialMatches;
        for (_i = 0, _len = _ref5.length; _i < _len; _i++) {
          binding = _ref5[_i];
          if (!liveMatches.has(binding)) {
            this.bindingsToDisable.push(binding);
          }
        }
      }
      hasPartialMatches = partialMatches.length > 0;
      shouldUsePartialMatches = hasPartialMatches;
      if (isKeyup(keystroke)) {
        exactMatchCandidates = exactMatchCandidates.concat(this.pendingKeyupMatcher.getMatches(keystroke));
      }
      if (exactMatchCandidates.length > 0) {
        currentTarget = target;
        eventHandled = false;
        while (!eventHandled && (currentTarget != null) && currentTarget !== document) {
          exactMatches = this.findExactMatches(exactMatchCandidates, currentTarget);
          for (_j = 0, _len1 = exactMatches.length; _j < _len1; _j++) {
            exactMatchCandidate = exactMatches[_j];
            if (exactMatchCandidate.command === 'native!') {
              shouldUsePartialMatches = false;
              eventHandled = true;
              break;
            }
            if (exactMatchCandidate.command === 'abort!') {
              event.preventDefault();
              eventHandled = true;
              break;
            }
            if (exactMatchCandidate.command === 'unset!') {
              break;
            }
            if (hasPartialMatches) {
              allPartialMatchesContainKeyupRemainder = true;
              for (_k = 0, _len2 = partialMatches.length; _k < _len2; _k++) {
                partialMatch = partialMatches[_k];
                if (pendingKeyupMatchCandidates.indexOf(partialMatch) < 0) {
                  allPartialMatchesContainKeyupRemainder = false;
                  break;
                }
              }
              if (allPartialMatchesContainKeyupRemainder === false) {
                break;
              }
            } else {
              shouldUsePartialMatches = false;
            }
            if (this.dispatchCommandEvent(exactMatchCandidate.command, target, event)) {
              dispatchedExactMatch = exactMatchCandidate;
              eventHandled = true;
              for (_l = 0, _len3 = pendingKeyupMatchCandidates.length; _l < _len3; _l++) {
                pendingKeyupMatch = pendingKeyupMatchCandidates[_l];
                this.pendingKeyupMatcher.addPendingMatch(pendingKeyupMatch);
              }
              break;
            }
          }
          currentTarget = currentTarget.parentElement;
        }
      }
      if (dispatchedExactMatch != null) {
        this.emitter.emit('did-match-binding', {
          keystrokes: keystrokes,
          eventType: event.type,
          binding: dispatchedExactMatch,
          keyboardEventTarget: target
        });
      } else if (hasPartialMatches && shouldUsePartialMatches) {
        event.preventDefault();
        this.emitter.emit('did-partially-match-binding', {
          keystrokes: keystrokes,
          eventType: event.type,
          partiallyMatchedBindings: partialMatches,
          keyboardEventTarget: target
        });
      } else if ((dispatchedExactMatch == null) && !hasPartialMatches) {
        this.emitter.emit('did-fail-to-match-binding', {
          keystrokes: keystrokes,
          eventType: event.type,
          keyboardEventTarget: target
        });
        if (event.defaultPrevented && event.type === 'keydown') {
          this.simulateTextInput(event);
        }
      }
      if (dispatchedExactMatch) {
        this.bindingsToDisable.push(dispatchedExactMatch);
      }
      if (hasPartialMatches && shouldUsePartialMatches) {
        enableTimeout = (this.pendingStateTimeoutHandle != null) || (exactMatchCandidate != null) || (characterForKeyboardEvent(this.queuedKeyboardEvents[0]) != null);
        if (replay) {
          enableTimeout = false;
        }
        return this.enterPendingState(partialMatches, enableTimeout);
      } else if ((dispatchedExactMatch == null) && !hasPartialMatches && (this.pendingPartialMatches != null)) {
        return this.terminatePendingState();
      } else {
        return this.clearQueuedKeystrokes();
      }
    };

    KeymapManager.prototype.keystrokeForKeyboardEvent = function(event) {
      return keystrokeForKeyboardEvent(event, this.customKeystrokeResolvers);
    };

    KeymapManager.prototype.addKeystrokeResolver = function(resolver) {
      this.customKeystrokeResolvers.push(resolver);
      return new Disposable((function(_this) {
        return function() {
          var index;
          index = _this.customKeystrokeResolvers.indexOf(resolver);
          if (index >= 0) {
            return _this.customKeystrokeResolvers.splice(index, 1);
          }
        };
      })(this));
    };

    KeymapManager.prototype.getPartialMatchTimeout = function() {
      return this.partialMatchTimeout;
    };


    /*
    Section: Private
     */

    KeymapManager.prototype.simulateTextInput = function(keydownEvent) {
      var character, textInputEvent;
      if (character = characterForKeyboardEvent(keydownEvent)) {
        textInputEvent = document.createEvent("TextEvent");
        textInputEvent.initTextEvent("textInput", true, true, window, character);
        return keydownEvent.path[0].dispatchEvent(textInputEvent);
      }
    };

    KeymapManager.prototype.getOtherPlatforms = function() {
      return OtherPlatforms;
    };

    KeymapManager.prototype.findMatchCandidates = function(keystrokeArray, disabledBindings) {
      var binding, disabledBindingSet, doesMatch, exactMatchCandidates, partialMatchCandidates, pendingKeyupMatchCandidates, _i, _len, _ref3;
      partialMatchCandidates = [];
      exactMatchCandidates = [];
      pendingKeyupMatchCandidates = [];
      disabledBindingSet = new Set(disabledBindings);
      _ref3 = this.keyBindings;
      for (_i = 0, _len = _ref3.length; _i < _len; _i++) {
        binding = _ref3[_i];
        if (!(!disabledBindingSet.has(binding))) {
          continue;
        }
        doesMatch = binding.matchesKeystrokes(keystrokeArray);
        if (doesMatch === MATCH_TYPES.EXACT) {
          exactMatchCandidates.push(binding);
        } else if (doesMatch === MATCH_TYPES.PARTIAL) {
          partialMatchCandidates.push(binding);
        } else if (doesMatch === MATCH_TYPES.PENDING_KEYUP) {
          partialMatchCandidates.push(binding);
          pendingKeyupMatchCandidates.push(binding);
        }
      }
      return {
        partialMatchCandidates: partialMatchCandidates,
        pendingKeyupMatchCandidates: pendingKeyupMatchCandidates,
        exactMatchCandidates: exactMatchCandidates
      };
    };

    KeymapManager.prototype.findPartialMatches = function(partialMatchCandidates, target) {
      var ignoreKeystrokes, partialMatches;
      partialMatches = [];
      ignoreKeystrokes = new Set;
      partialMatchCandidates.forEach(function(binding) {
        if (binding.command === 'unset!') {
          return ignoreKeystrokes.add(binding.keystrokes);
        }
      });
      while (partialMatchCandidates.length > 0 && (target != null) && target !== document) {
        partialMatchCandidates = partialMatchCandidates.filter(function(binding) {
          if (!ignoreKeystrokes.has(binding.keystrokes) && target.webkitMatchesSelector(binding.selector)) {
            partialMatches.push(binding);
            return false;
          } else {
            return true;
          }
        });
        target = target.parentElement;
      }
      return partialMatches.sort(function(a, b) {
        return b.keystrokeCount - a.keystrokeCount;
      });
    };

    KeymapManager.prototype.findExactMatches = function(exactMatchCandidates, target) {
      return exactMatchCandidates.filter(function(binding) {
        return target.webkitMatchesSelector(binding.selector);
      }).sort(function(a, b) {
        return a.compare(b);
      });
    };

    KeymapManager.prototype.clearQueuedKeystrokes = function() {
      this.queuedKeyboardEvents = [];
      this.queuedKeystrokes = [];
      return this.bindingsToDisable = [];
    };

    KeymapManager.prototype.enterPendingState = function(pendingPartialMatches, enableTimeout) {
      if (this.pendingStateTimeoutHandle != null) {
        this.cancelPendingState();
      }
      this.pendingPartialMatches = pendingPartialMatches;
      if (enableTimeout) {
        return this.pendingStateTimeoutHandle = setTimeout(this.terminatePendingState.bind(this, true), this.partialMatchTimeout);
      }
    };

    KeymapManager.prototype.cancelPendingState = function() {
      clearTimeout(this.pendingStateTimeoutHandle);
      this.pendingStateTimeoutHandle = null;
      return this.pendingPartialMatches = null;
    };

    KeymapManager.prototype.terminatePendingState = function(fromTimeout) {
      var bindingsToDisable, event, eventsToReplay, keyEventOptions, _i, _len;
      bindingsToDisable = this.pendingPartialMatches.concat(this.bindingsToDisable);
      eventsToReplay = this.queuedKeyboardEvents;
      this.cancelPendingState();
      this.clearQueuedKeystrokes();
      keyEventOptions = {
        replay: true,
        disabledBindings: bindingsToDisable
      };
      for (_i = 0, _len = eventsToReplay.length; _i < _len; _i++) {
        event = eventsToReplay[_i];
        keyEventOptions.disabledBindings = bindingsToDisable;
        this.handleKeyboardEvent(event, keyEventOptions);
        if ((bindingsToDisable != null) && (this.pendingPartialMatches == null)) {
          bindingsToDisable = null;
        }
      }
      if (fromTimeout && (this.pendingPartialMatches != null)) {
        this.terminatePendingState(true);
      }
    };

    KeymapManager.prototype.dispatchCommandEvent = function(command, target, keyboardEvent) {
      var commandEvent, keyBindingAborted;
      commandEvent = new CustomEvent(command, {
        bubbles: true,
        cancelable: true
      });
      commandEvent.__proto__ = CommandEvent.prototype;
      commandEvent.originalEvent = keyboardEvent;
      if (document.contains(target)) {
        target.dispatchEvent(commandEvent);
      } else {
        this.simulateBubblingOnDetachedTarget(target, commandEvent);
      }
      keyBindingAborted = commandEvent.keyBindingAborted;
      if (!keyBindingAborted) {
        keyboardEvent.preventDefault();
      }
      return !keyBindingAborted;
    };

    KeymapManager.prototype.simulateBubblingOnDetachedTarget = function(target, commandEvent) {
      var currentTarget, _ref3;
      Object.defineProperty(commandEvent, 'target', {
        get: function() {
          return target;
        }
      });
      Object.defineProperty(commandEvent, 'currentTarget', {
        get: function() {
          return currentTarget;
        }
      });
      currentTarget = target;
      while (currentTarget != null) {
        currentTarget.dispatchEvent(commandEvent);
        if (commandEvent.propagationStopped) {
          break;
        }
        if (currentTarget === window) {
          break;
        }
        currentTarget = (_ref3 = currentTarget.parentNode) != null ? _ref3 : window;
      }
    };

    return KeymapManager;

  })();

}).call(this);
