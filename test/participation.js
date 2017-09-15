const Participation = artifacts.require('Participation');
const chai = require('chai');
const assert = chai.assert;

contract('Participation', (accounts) => {
  let ptcp;
  before('Get the contract', async () => {
    ptcp = await Participation.deployed();
  });

  it('account is not permitted to subscribe if it was never listed', async () => {
    const res = await ptcp.isSubscriptionPermitted.call(accounts[9], 10, 20);
    assert.isFalse(res);
  });
  it('account is permitted to subscribe after listing', async () => {
    ptcp.attestForIdentity(accounts[1]);
    const res = await ptcp.isSubscriptionPermitted.call(accounts[1], 10, 20);
    assert(res);
  });
  it('delisting removes subscribe permissions', async () => {
    let res = await ptcp.isSubscriptionPermitted.call(accounts[1], 10, 20);
    assert(res);
    await ptcp.removeAttestation(accounts[1]);
    res = await ptcp.isSubscriptionPermitted.call(accounts[1], 10, 20);
    assert.isFalse(res);
  });
  it('redeem request is always allowed', async () => {
    const res = await ptcp.isRedemptionPermitted.call(accounts[9], 10, 20);
    assert(res);
  });
});
