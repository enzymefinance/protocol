const PreminedAsset = artifacts.require('PreminedAsset');
const tokens = require('../migrations/config/token_info').kovan;
const chai = require('chai');

const assert = chai.assert;

contract('Assets', (accounts) => {
  let mlnToken;
  let PREMINED = Math.pow(10, 28);

  before('Deploy asset', async () => {
    const mln = tokens.find(t => t.symbol === 'MLN-T');
    mlnToken = await PreminedAsset.new(mln.name, mln.symbol, mln.decimals, PREMINED); // TODO: outsource deploying these to a util fn
  });

  it('Should have correct amount of premined tokens', async () =>
    assert.equal(await mlnToken.balanceOf(accounts[0]), PREMINED)
  );
});
