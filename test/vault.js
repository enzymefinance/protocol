const Vault = artifacts.require('Vault');
const EtherToken = artifacts.require('EtherToken');
const chai = require('chai');

const assert = chai.assert;

describe.skip('Temporary skip', () => {
contract('Vault', (accounts) => {
  const investor = accounts[1];
  let ethToken;
  let vault;

  before('Get contract instances', async () => {
    ethToken = await EtherToken.deployed();
    vault = await Vault.deployed();
  });

  describe('#createShares()', () => {
    const wantedShares = 10000;
    const offeredValue = 10000;
    it('Creates shares of empty vault with reference asset', async () => {
      await ethToken.approve(vault.address, offeredValue, { from: investor });
      await vault.subscribeWithReferenceAsset(wantedShares, offeredValue);
      assert.equal(await vault.balanceOf(investor), wantedShares);
    });
  });

  describe('#annihilateShares()', () => {

  });
});
});
