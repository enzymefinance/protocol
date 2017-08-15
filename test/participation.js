const Participation = artifacts.require('Participation');
const chai = require('chai');
const assert = chai.assert;

contract('Participation', (accounts) => {
  let ptcp;
  before('Get the contract', async () => {
    ptcp = await Participation.deployed();
  });

  it('account is not permitted to subscribe if it was never listed', async () => {
    const res = await ptcp.isSubscribeRequestPermitted(accounts[9], 10, 20);
    assert.isFalse(res);
  });
  it('account is permitted to subscribe after listing', async () => {
    ptcp.list(accounts[1]);
    const res = await ptcp.isSubscribeRequestPermitted(accounts[1], 10, 20);
    assert(res);
  });
  it('listing multiple accounts permits them all to subscribe', async () => {
    await ptcp.bulkList([accounts[2], accounts[3], accounts[4], accounts[5]]);
    const allRes = await Promise.all([2, 3, 4, 5].map(ii =>
      ptcp.isSubscribeRequestPermitted(accounts[ii], 10, 20)
    ));
    assert.notInclude(allRes, false);
  });
  it('delisting removes subscribe permissions', async () => {
    let res = await ptcp.isSubscribeRequestPermitted(accounts[1], 10, 20);
    assert(res);
    await ptcp.delist(accounts[1]);
    res = await ptcp.isSubscribeRequestPermitted(accounts[1], 10, 20);
    assert.isFalse(res);
  });
  it('redeem request is always allowed', async () => {
    const res = await ptcp.isRedeemRequestPermitted(accounts[9], 10, 20);
    assert(res);
  });
});
