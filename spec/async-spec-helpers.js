// The timeout reads performance.now: spec-helper fakes Date.now, which stands
// still unless a spec advances the clock, so a false condition never timed out.
async function conditionPromise(
  condition,
  description = 'anonymous condition'
) {
  const startTime = performance.now();

  while (true) {
    await timeoutPromise(100);

    // if condition is sync
    if (condition.constructor.name !== 'AsyncFunction' && condition()) {
      return;
    }
    // if condition is async
    else if (await condition()) {
      return;
    }

    if (performance.now() - startTime > 5000) {
      throw new Error('Timed out waiting on ' + description);
    }
  }
}

function timeoutPromise(timeout) {
  return new Promise(resolve => {
    global.setTimeout(resolve, timeout);
  });
}

function emitterEventPromise(emitter, event, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error(`Timed out waiting for '${event}' event`));
    }, timeout);
    emitter.once(event, () => {
      clearTimeout(timeoutHandle);
      resolve();
    });
  });
}

exports.conditionPromise = conditionPromise;
exports.emitterEventPromise = emitterEventPromise;
exports.timeoutPromise = timeoutPromise;
