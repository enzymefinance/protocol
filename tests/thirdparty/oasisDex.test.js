import { toWei } from 'web3-utils';
import web3 from '~/deploy/utils/get-web3';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { CONTRACT_NAMES } from '~/tests/utils/constants';

describe('account-trading', () => {
  let defaultTxOpts;
  let mln, weth, oasisDex, oasisDexAccessor;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    defaultTxOpts = { from: accounts[0], gas: 8000000 };

    const deployed = await partialRedeploy(
      [CONTRACT_NAMES.VERSION, CONTRACT_NAMES.OASIS_DEX_EXCHANGE]
    );
    const contracts = deployed.contracts;

    mln = contracts.MLN;
    weth = contracts.WETH;
    oasisDex = contracts.OasisDexExchange;
    oasisDexAccessor = contracts.OasisDexAccessor;
  });

  test('Happy path', async () => {
    const order1 = {
      buyQuantity: toWei('0.1', 'ether'),
      buyAsset: weth.options.address,
      sellQuantity: toWei('2', 'ether'),
      sellAsset: mln.options.address
    };

    await mln.methods
      .approve(oasisDex.options.address, order1.sellQuantity)
      .send(defaultTxOpts);

    await oasisDex.methods
      .offer(
        order1.sellQuantity,
        order1.sellAsset,
        order1.buyQuantity,
        order1.buyAsset,
        0
      )
      .send(defaultTxOpts);

    const activeOrders1 = await oasisDexAccessor.methods
      .getOrders(oasisDex.options.address, order1.sellAsset, order1.buyAsset)
      .call()

    order1.id = activeOrders1[0][0];
    expect(activeOrders1[1][0].toString()).toBe(order1.sellQuantity.toString());
    expect(activeOrders1[2][0].toString()).toBe(order1.buyQuantity.toString());

    await weth.methods
      .approve(oasisDex.options.address, order1.buyQuantity)
      .send(defaultTxOpts);

    await oasisDex.methods
      .buy(
        order1.id,
        order1.sellQuantity
      )
      .send(defaultTxOpts);

    const activeOrders2 = await oasisDexAccessor.methods
      .getOrders(oasisDex.options.address, order1.sellAsset, order1.buyAsset)
      .call()

    expect(activeOrders2[0].length).toBe(0);

    const order2 = {
      buyQuantity: toWei('2', 'ether'),
      buyAsset: mln.options.address,
      sellQuantity: toWei('0.1', 'ether'),
      sellAsset: weth.options.address
    };

    await weth.methods
      .approve(oasisDex.options.address, order2.sellQuantity)
      .send(defaultTxOpts);

    await oasisDex.methods
      .offer(
        order2.sellQuantity,
        order2.sellAsset,
        order2.buyQuantity,
        order2.buyAsset,
        0
      )
      .send(defaultTxOpts);

    const activeOrders3 = await oasisDexAccessor.methods
      .getOrders(oasisDex.options.address, order2.sellAsset, order2.buyAsset)
      .call()

    order2.id = activeOrders3[0][0];
    expect(activeOrders3[1][0].toString()).toBe(order2.sellQuantity.toString());
    expect(activeOrders3[2][0].toString()).toBe(order2.buyQuantity.toString());

    await oasisDex.methods
      .cancel(order2.id)
      .send(defaultTxOpts);

    const activeOrders4 = await oasisDexAccessor.methods
      .getOrders(oasisDex.options.address, order2.sellAsset, order2.buyAsset)
      .call()

    expect(activeOrders4[0].length).toBe(0);
  });
});
