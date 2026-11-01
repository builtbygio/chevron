let parser
try {
  parser = require('./snippet-body')
} catch (error) {
  const {allowUnsafeEval} = require('loophole')
  const fs = require('fs-plus')
  const PEG = require('pegjs')

  const grammarSrc = fs.readFileSync(require.resolve('./snippet-body.pegjs'), 'utf8')
  parser = null
  // pegjs 0.10 renamed buildParser → generate.
  allowUnsafeEval(() => parser = PEG.generate(grammarSrc))
}

module.exports = parser
