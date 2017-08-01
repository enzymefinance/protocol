const Logger = artifacts.require('Logger');

contract('Logger', (accounts) => {
  let logger;
  before('Setup contracts', async () => {
    logger = await Logger.new();
  });

  it.skip('Logs correct parameters when called directly', async () => {
    const errEvent = logger.Error();
    await logger.logError(accounts[0], 0, 'Some error');
    events = await errEvent.get();
    assert.equal(events.length, 1);
    assert.equal(events[0].args.thrower, accounts[0]);
    assert.equal(events[0].args.errCode.toNumber(), 0);
    assert.equal(events[0].args.errMsg, 'Some error');
  });
});
