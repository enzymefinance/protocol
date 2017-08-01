const Logger = artifacts.require('Logger');
const chai = require('chai');
const assert = chai.assert;

contract('Logger', (accounts) => {
  let logger;
  before('Setup contracts', async () => {
    logger = await Logger.new();
  });

  it.skip('Logs correct parameters when called directly', async () => {
    const errEvent = logger.Error();
    await logger.logError(accounts[0], 0, 'Some error', { from: accounts[0] });
    events = await errEvent.get();
    assert.equal(events.length, 1);
    assert.equal(events[0].args.thrower, accounts[0]);
    assert.equal(events[0].args.errCode.toNumber(), 0);
    assert.equal(events[0].args.errMsg, 'Some error');
  });
  it('Errors when called from address without permissions', () => {
    return logger.logError(accounts[0], 1, 'Error', { from: accounts[1] })
      .then(() => assert(false, 'Nothing thrown'))
      .catch(err => assert.include(err.message, 'invalid opcode'));
  });
});
