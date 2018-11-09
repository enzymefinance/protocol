import test from 'ava';
import web3 from '../../../utils/lib/web3';
import deployEnvironment from '../../../utils/deploy/contracts';

const environmentConfig = require('../../../utils/config/environment.js');

const environment = 'development';
const config = environmentConfig[environment];
const BigNumber = require('bignumber.js');

const precisionUnits = new BigNumber(10 ** 18).toFixed();

// hoisted variables
let accounts;
let opts;
let deployed;

test.before(async () => {
  accounts = await web3.eth.getAccounts();
  opts = { from: accounts[0], gas: config.gas, gasPrice: config.gasPrice };
  deployed = await deployEnvironment(environment);
});

test.beforeEach(async t => {
  t.context.baseBuyRate = [];
  t.context.baseSellRate = [];
});

// TODO: Avoid serial unit tests
test.serial('getRate smooths out the spread', async t => {
  const actualPrice = new BigNumber(10 ** 18);
  const actualInversePrice = new BigNumber(precisionUnits).mul(precisionUnits).mul(1).div(actualPrice)
  const spreadMultiplier = 0.02;
  const ethersPerToken = actualPrice.sub(actualPrice.mul(spreadMultiplier)).toFixed();
  const tokensPerEther = actualInversePrice.sub(actualInversePrice.mul(spreadMultiplier)).toFixed();
  t.context.baseBuyRate.push(tokensPerEther);
  t.context.baseSellRate.push(ethersPerToken);
  const currentBlock = await web3.eth.getBlockNumber();
  await deployed.ConversionRates.methods
    .setBaseRate(
    [deployed.MlnToken.options.address],
    t.context.baseBuyRate,
    t.context.baseSellRate,
    [],
    [],
    currentBlock,
    [],
    )
    .send(opts);
    const priceFromFeed = new BigNumber(
      (await deployed.KyberPriceFeed.methods
        .getPrice(deployed.MlnToken.options.address)
        .call()).price,
    );

    // Not perfect figure due to precision loss
    t.true(priceFromFeed.sub(actualPrice).div(actualPrice).toFixed() < 0.001);
});

test.serial('Spread cannot be more than 10%', async t => {
  const mlnPrice = new BigNumber(10 ** 18);
  const ethersPerToken = mlnPrice.toFixed();
  const tokensPerEther = new BigNumber(precisionUnits)
    .mul(precisionUnits).mul(2)
    .div(ethersPerToken)
    .toFixed(0);
  t.context.baseBuyRate.push(tokensPerEther);
  t.context.baseSellRate.push(ethersPerToken);
  const currentBlock = await web3.eth.getBlockNumber();
  await deployed.ConversionRates.methods
    .setBaseRate(
      [deployed.MlnToken.options.address],
      t.context.baseBuyRate,
      t.context.baseSellRate,
      [],
      [],
      currentBlock,
      [],
    )
    .send(opts);
  await t.throws(deployed.KyberPriceFeed.methods
    .getPrice(deployed.MlnToken.options.address)
    .call());    
});