// Global Mocha helpers

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')

chai.use(chaiAsPromised.default || chaiAsPromised)

global.assert = chai.assert

global.until = require('test-until')

if (process.env.APPVEYOR === 'True') {
  until.setDefaultTimeout(20000)
}
