import { toWei } from 'web3-utils';

import { Environment } from '~/utils/environment/Environment';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { getContract } from '~/utils/solidity/getContract';
import { deployAndInitTestEnv } from '../utils/deployAndInitTestEnv';
import { CONTRACT_NAMES, EXCHANGES } from '../utils/new/constants';

describe('account-trading', () => {
  let environment, user, defaultTxOpts;
  let matchingMarketAddress;
  let mlnTokenInfo, wethTokenInfo;
  let mln, weth, matchingMarket, matchingMarketAccessor;

  beforeAll(async () => {
    environment = await deployAndInitTestEnv();
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };

    mlnTokenInfo = getTokenBySymbol(environment, 'MLN');
    wethTokenInfo = getTokenBySymbol(environment, 'WETH');

    mln = getContract(
      environment,
      CONTRACT_NAMES.PREMINED_TOKEN,
      mlnTokenInfo.address
    );

    weth = getContract(
      environment,
      CONTRACT_NAMES.WETH,
      wethTokenInfo.address
    );

    matchingMarketAddress =
      environment.deployment.exchangeConfigs[EXCHANGES.OASIS_DEX].exchange.toString();
    matchingMarket = getContract(
      environment,
      CONTRACT_NAMES.MATCHING_MARKET,
      matchingMarketAddress
    );

    const matchingMarketAccessorAddress =
      environment.deployment.melonContracts.adapters.matchingMarketAccessor.toString();
    matchingMarketAccessor = getContract(
      environment,
      CONTRACT_NAMES.MATCHING_MARKET_ACCESSOR,
      matchingMarketAccessorAddress
    );
  });

  it('Happy path', async () => {
    const order1 = {
      buyQuantity: toWei('0.1', 'ether'),
      buyAsset: wethTokenInfo.address,
      sellQuantity: toWei('2', 'ether'),
      sellAsset: mlnTokenInfo.address
    };

    await mln.methods
      .approve(matchingMarket.options.address, order1.sellQuantity)
      .send(defaultTxOpts);

    await matchingMarket.methods
      .offer(
        order1.sellQuantity,
        order1.sellAsset,
        order1.buyQuantity,
        order1.buyAsset,
        0
      )
      .send(defaultTxOpts);

    const activeOrders1 = await matchingMarketAccessor.methods
      .getOrders(matchingMarketAddress, order1.sellAsset, order1.buyAsset)
      .call()

    order1.id = activeOrders1[0][0];
    expect(activeOrders1[1][0]).toEqual(order1.sellQuantity);
    expect(activeOrders1[2][0]).toEqual(order1.buyQuantity);

    await weth.methods
      .approve(matchingMarket.options.address, order1.buyQuantity)
      .send(defaultTxOpts);

    await matchingMarket.methods
      .buy(
        order1.id,
        order1.sellQuantity
      )
      .send(defaultTxOpts);

    const activeOrders2 = await matchingMarketAccessor.methods
      .getOrders(matchingMarketAddress, order1.sellAsset, order1.buyAsset)
      .call()

    expect(activeOrders2[0].length).toBe(0);

    const order2 = {
      buyQuantity: toWei('2', 'ether'),
      buyAsset: mlnTokenInfo.address,
      sellQuantity: toWei('0.1', 'ether'),
      sellAsset: wethTokenInfo.address
    };

    await weth.methods
      .approve(matchingMarket.options.address, order2.sellQuantity)
      .send(defaultTxOpts);

    await matchingMarket.methods
      .offer(
        order2.sellQuantity,
        order2.sellAsset,
        order2.buyQuantity,
        order2.buyAsset,
        0
      )
      .send(defaultTxOpts);

    const activeOrders3 = await matchingMarketAccessor.methods
      .getOrders(matchingMarketAddress, order2.sellAsset, order2.buyAsset)
      .call()

    order2.id = activeOrders3[0][0];
    expect(activeOrders3[1][0]).toEqual(order2.sellQuantity);
    expect(activeOrders3[2][0]).toEqual(order2.buyQuantity);

    await matchingMarket.methods
      .cancel(order2.id)
      .send(defaultTxOpts);

    const activeOrders4 = await matchingMarketAccessor.methods
      .getOrders(matchingMarketAddress, order2.sellAsset, order2.buyAsset)
      .call()

    expect(activeOrders4[0].length).toBe(0);
  });
});
