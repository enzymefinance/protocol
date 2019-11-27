import { toWei } from 'web3-utils';
import { deployAndInitTestEnv } from '../utils/deployAndInitTestEnv';
import { stringToBytes } from '../utils/new/formatting';
import { getContract } from '~/utils/solidity/getContract';
import { CONTRACT_NAMES } from '../utils/new/constants';
const getFundComponents = require('../utils/new/getFundComponents');
const web3 = require('../../../deploy/utils/get-web3');
const deploySystem = require('../../../deploy/scripts/deploy-system');

describe('amgu', () => {
  let user, defaultTxOpts;
  let baseToken, quoteToken;
  let engine, version, priceSource;
  let amguPrice;
  let fundName;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };

    const deployment = await deploySystem(JSON.parse(require('fs').readFileSync(process.env.CONF))); // TODO: change from reading file each time
    const contracts = deployment.contracts;

    engine = contracts.Engine;
    version = contracts.Version;
    priceSource = contracts.TestingPriceFeed;

    // [quoteToken, baseToken] = thirdPartyContracts.tokens;
    quoteToken = contracts.WETH;
    baseToken = contracts.MLN;

    amguPrice = '1000000000';
    fundName = `test-fund-${Date.now()}`;
  });

  it('Set amgu and check its usage', async () => {
    const oldAmguPrice = await engine.methods.getAmguPrice().call();
    await engine.methods
      .setAmguPrice(amguPrice)
      .send(defaultTxOpts)
    const newAmguPrice = await engine.methods.getAmguPrice().call();

    expect(newAmguPrice.toString()).toBe(amguPrice.toString());
    expect(newAmguPrice.toString()).not.toBe(oldAmguPrice.toString());

    const newPrice = toWei('2', 'ether');
    await priceSource.methods
      .update([baseToken.options.address], [newPrice])
      .send(defaultTxOpts)

    const price = await priceSource.methods
      .getPrices([baseToken.options.address])
      .call();

    expect(price[0][0].toString()).toBe(newPrice.toString());

    const preBalance = await web3.eth.getBalance(user);

    const beginSetupTx = version.methods
      .beginSetup(
        stringToBytes(fundName, 32),
        [],
        [],
        [],
        [],
        [],
        quoteToken.options.address,
        [baseToken.options.address, quoteToken.options.address]
      );
    const estimatedGas = await beginSetupTx.estimateGas();
    const result = await beginSetupTx.send(defaultTxOpts);

    const postBalance = await web3.eth.getBalance(user);

    const diffQ = preBalance - postBalance;

    expect(result).toBeTruthy();
    expect(diffQ).toBeGreaterThan(estimatedGas);
  });
});
