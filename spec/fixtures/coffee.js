/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
class quicksort {
  sort(items) {
    if (items.length <= 1) { return items; }

    const pivot = items.shift();
    const left = [];
    const right = [];

    // Comment in the middle

    while (items.length > 0) {
      var current = items.shift();
      if (current < pivot) {
        left.push(current);
      } else {
        right.push(current);
      }
    }

    return sort(left).concat(pivot).concat(sort(right));
  }

  noop() {}
}
    // just a noop

exports.modules = quicksort;
