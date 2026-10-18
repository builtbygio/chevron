/* eslint-disable no-new */
const path = require('path');
const BufferedNodeProcess = require('../src/buffered-node-process');
const { conditionPromise } = require('./async-spec-helpers');

describe('BufferedNodeProcess', function() {
  it('executes the script in a new process', async function() {
    jasmine.useRealClock();
    const exit = jasmine.createSpy('exitCallback');
    let output = '';
    const stdout = lines => (output += lines);
    let error = '';
    const stderr = lines => (error += lines);
    const args = ['hi'];
    const command = path.join(__dirname, 'fixtures', 'script.js');

    new BufferedNodeProcess({ command, args, stdout, stderr, exit });

    await conditionPromise(() => exit.callCount === 1);
    expect(output).toBe('hi');
    expect(error).toBe('');
    expect(args).toEqual(['hi']);
  });

  it('suppresses deprecations in the new process', async function() {
    jasmine.useRealClock();
    const exit = jasmine.createSpy('exitCallback');
    let output = '';
    const stdout = lines => (output += lines);
    let error = '';
    const stderr = lines => (error += lines);
    const command = path.join(
      __dirname,
      'fixtures',
      'script-with-deprecations.js'
    );

    new BufferedNodeProcess({ command, stdout, stderr, exit });

    await conditionPromise(() => exit.callCount === 1);
    expect(output).toBe('hi');
    expect(error).toBe('');
  });
});
