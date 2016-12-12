const assert = require('assert');


contract('Meta', (accounts) => {
  // Test constants
  const OWNER = accounts[0];

  // Test globals
  let coreContract;

  it('Create a Core contract through the Meta contract', (done) => {
    Meta.new()
        .then((result) => {
          contract = result;
          return Meta.createPortfolio(
              EtherToken.address,
              Registrar.address,
              { from: OWNER });
        })
        .then(() => Meta.numPortfolios())
        .then((result) => {
          assert.strictEqual(result.toNumber(), 1);
          return Meta.portfolios(0);
        })
        .then((result) => {
          coreContract = Core.at(result);
          return coreContract.owner();
        })
        .then((result) => {
          assert.equal(OWNER, result, 'Core.owner != OWNER!');
        })
        .then(done)
        .catch(done);
  });
});
