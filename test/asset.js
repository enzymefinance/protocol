const PreminedAsset = artifacts.require('PreminedAsset');
const EtherToken = artifacts.require('EtherToken');
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

contract('EtherToken', (accounts) => {
  let ethToken;
  let initial;
  const amt = 100000;
  const user = accounts[1];
  before('Deploy token', async () => {
    ethToken = await EtherToken.new();
    initial = await ethToken.balanceOf(user);
  });

  it('allows deposit', async () => {
    await ethToken.deposit({ from: user, value: amt });
    const newBal = await ethToken.balanceOf(user);
    assert.equal(newBal.toNumber(), initial + amt);
  });
  it('allows withdrawal', async () => {
    await ethToken.withdraw(amt, { from: user });
    const newBal = await ethToken.balanceOf(user);
    assert.equal(newBal.toNumber(), initial.toNumber());
  });
});
