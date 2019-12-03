import { toWei } from 'web3-utils';

import web3 from '~/../deploy/utils/get-web3';
import { partialRedeploy } from '~/../deploy/scripts/deploy-system';

import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { stringToBytes } from '~/tests/utils/formatting';
import getFundComponents from '~/tests/utils/getFundComponents';

describe('amgu', () => {
  let user, defaultTxOpts;
  let baseToken, quoteToken;
  let engine, version, priceSource;
  let amguPrice, oldAmguPrice;
  let fundName;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };

    const deployed = await partialRedeploy([
      CONTRACT_NAMES.VERSION,
      CONTRACT_NAMES.ENGINE
    ]);
    const contracts = deployed.contracts;

    engine = contracts.Engine;
    version = contracts.Version;
    priceSource = contracts.TestingPriceFeed;

    // [quoteToken, baseToken] = thirdPartyContracts.tokens;
    quoteToken = contracts.WETH;
    baseToken = contracts.MLN;

    oldAmguPrice = await engine.methods.getAmguPrice().call();
    amguPrice = '1000000000';
    fundName = `test-fund-${Date.now()}`;
  });

  it('Set amgu and check its usage', async () => {
    await engine.methods
      .setAmguPrice(amguPrice)
      .send(defaultTxOpts)
    const newAmguPrice = await engine.methods.getAmguPrice().call();

    expect(newAmguPrice.toString()).toBe(amguPrice.toString());

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
