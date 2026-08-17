'use strict';

/** Fixture: provides a service across the host boundary (Epic 21.3). */

class MathService {
  add(a, b) {
    return a + b;
  }
  async slowDouble(n) {
    return n * 2;
  }
  boom() {
    throw new Error('service method failed');
  }
}

module.exports = {
  activate() {},
  provideMath() {
    return new MathService();
  },
  deactivate() {}
};
