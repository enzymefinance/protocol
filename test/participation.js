const Participation = artifacts.require('Participation');
const chai = require('chai');
const assert = chai.assert;

contract('Participation', (accounts) => {
  let ptcp;
  before('Get the contract', async () => {
    ptcp = await Participation.deployed();
  });

  it('subscription is always allowed', async () => {
    const result = await ptcp.isSubscribePermitted(accounts[1], 10);
    assert(result);
  });
  it('all subscribers are allowed', async () => {
    const result = await ptcp.isSubscriberPermitted(accounts[1], 10);
    assert(result);
  });
  it('redeem is always allowed', async () => {
    const result = await ptcp.isRedeemPermitted(accounts[1], 10);
    assert(result);
  });
});
