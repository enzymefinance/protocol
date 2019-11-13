import { toWei } from 'web3-utils';

import { Contracts } from '~/Contracts';
import { deployAndInitTestEnv } from '../utils/deployAndInitTestEnv';
import { Environment, Tracks } from '~/utils/environment/Environment';
import { stringToBytes32 } from '~/utils/helpers/stringToBytes32';
import { getContract } from '~/utils/solidity/getContract';

describe('amgu', () => {
  let environment, user, defaultTxOpts;
  let baseToken, quoteToken;
  let engine, fundFactory, priceSource;
  let amguPrice;
  let fundName;

  beforeAll(async () => {
    environment = await deployAndInitTestEnv();
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };

    const {
      melonContracts,
      thirdPartyContracts,
    } = environment.deployment;

    [quoteToken, baseToken] = thirdPartyContracts.tokens;

    engine = getContract(
      environment,
      Contracts.Engine,
      melonContracts.engine
    );

    fundFactory = getContract(
      environment,
      Contracts.FundFactory,
      melonContracts.version
    );

    priceSource = getContract(
      environment,
      Contracts.TestingPriceFeed,
      melonContracts.priceSource
    );

    amguPrice = '1000000000';
    fundName = `test-fund-${Math.random().toString(36).substr(2, 4)}`;
  });

  it('Set amgu and check its usage', async () => {
    const oldAmguPrice = await engine.methods.getAmguPrice().call();
    await engine.methods
      .setAmguPrice(amguPrice)
      .send(defaultTxOpts)
    const newAmguPrice = await engine.methods.getAmguPrice().call();

    expect(newAmguPrice).toEqual(amguPrice);
    expect(newAmguPrice).not.toEqual(oldAmguPrice);

    if (environment.track === Tracks.TESTING) {
      const newPrice = toWei('2', 'ether');
      await priceSource.methods
        .update([baseToken.address], [newPrice])
        .send(defaultTxOpts)

      const price = await priceSource.methods
        .getPrices([baseToken.address])
        .call();

      expect(price[0][0]).toEqual(newPrice);
    }

    const preBalance = await environment.eth.getBalance(user);

    const exchangeConfigsValues = Object.values(environment.deployment.exchangeConfigs);
    const beginSetupTx = fundFactory.methods
      .beginSetup(
        stringToBytes32(fundName),
        [],
        [],
        [],
        exchangeConfigsValues.map(e => e.exchange.toString()),
        exchangeConfigsValues.map(e => e.adapter.toString()),
        quoteToken.address,
        [baseToken.address, quoteToken.address]
      );
    const estimatedGas = await beginSetupTx.estimateGas();
    const result = await beginSetupTx.send(defaultTxOpts);

    const postBalance = await environment.eth.getBalance(user);

    const diffQ = preBalance - postBalance;

    expect(result).toBeTruthy();
    expect(diffQ).toBeGreaterThan(estimatedGas);
  });
});
