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

test('Price is averaged over both sides', async t => {
  const mlnPrice = new BigNumber(10 ** 18);
  const ethersPerToken = mlnPrice.toFixed();
  const tokensPerEther = new BigNumber(precisionUnits)
    .mul(precisionUnits)
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
  const priceFromFeed = (await deployed.KyberPriceFeed.methods
    .getPrice(deployed.MlnToken.options.address)
    .call()).price;
  t.deepEqual(mlnPrice, new BigNumber(priceFromFeed));
});
