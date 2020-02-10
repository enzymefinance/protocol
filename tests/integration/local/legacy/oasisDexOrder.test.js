import { toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import web3 from '~/deploy/utils/get-web3';
import {
  CONTRACT_NAMES,
  EMPTY_ADDRESS
} from '~/tests/utils/constants';
import {
  getEventFromReceipt,
  getFunctionSignature
} from '~/tests/utils/metadata';
import {increaseTime} from '~/tests/utils/rpc';
import { setupInvestedTestFund } from '~/tests/utils/fund';

describe('make-oasis-dex-order', () => {
  let user, defaultTxOpts;
  let routes;
  let mln, weth, oasisDex, oasisDexAccessor, oasisDexAdapter, trading;
  let exchangeIndex;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };

    const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
    const contracts = deployed.contracts;
    routes = await setupInvestedTestFund(contracts, user);

    trading = routes.trading;
    oasisDex = contracts[CONTRACT_NAMES.OASIS_DEX_EXCHANGE];
    oasisDexAccessor = contracts[CONTRACT_NAMES.OASIS_DEX_ACCESSOR];
    oasisDexAdapter = contracts[CONTRACT_NAMES.OASIS_DEX_ADAPTER];
    mln = contracts.MLN;
    weth = contracts.WETH;

    const exchangeInfo = await trading.methods.getExchangeInfo().call();
    exchangeIndex = exchangeInfo[1].findIndex(
      e => e.toLowerCase() === oasisDexAdapter.options.address.toLowerCase()
    );
  });

  test('make oasisdex order', async () => {
    const makerAsset = weth.options.address;
    const makerQuantity = toWei('0.05', 'ether');
    const takerAsset = mln.options.address;
    const takerQuantity = toWei('1', 'ether');

    const makeOrderFunctionSig = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'makeOrder',
    );

    const activeOrderIdsInitial = (await oasisDexAccessor.methods
      .getOrders(oasisDex.options.address, makerAsset, takerAsset)
      .call(defaultTxOpts))[0];

    const order1 = await trading.methods
      .callOnExchange(
        exchangeIndex,
        makeOrderFunctionSig,
        [
          trading.options.address,
          EMPTY_ADDRESS,
          makerAsset,
          takerAsset,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, 0, 0],
        ['0x0', '0x0', '0x0', '0x0'],
        '0x0',
        '0x0'
      )
      .send(defaultTxOpts);

    const order1Vals = getEventFromReceipt(
      order1.events,
      CONTRACT_NAMES.OASIS_DEX_EXCHANGE,
      'LogMake'
    );

    expect(order1Vals.buy_amt).toEqual(takerQuantity);
    expect(order1Vals.pay_amt).toEqual(makerQuantity);
    expect(order1Vals.maker).toEqual(trading.options.address);

    await expect(
      trading.methods
        .callOnExchange(
          exchangeIndex,
          makeOrderFunctionSig,
          [
            trading.options.address,
            EMPTY_ADDRESS,
            makerAsset,
            takerAsset,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, 0, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0'
        )
        .send(defaultTxOpts)
    ).rejects.toThrow('Cooldown for the maker asset not reached');

    const cancelOrderFunctionSig = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'cancelOrder',
    );
    await trading.methods
      .callOnExchange(
        exchangeIndex,
        cancelOrderFunctionSig,
        [
          trading.options.address,
          EMPTY_ADDRESS,
          makerAsset,
          takerAsset,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
        ],
        [0, 0, 0, 0, 0, 0, 0, 0],
        ['0x0', '0x0', '0x0', '0x0'],
        order1Vals.id,
        '0x0'
      )
      .send(defaultTxOpts);

    await increaseTime(60*30);

    const order2 = await trading.methods
      .callOnExchange(
        exchangeIndex,
        makeOrderFunctionSig,
        [
          trading.options.address,
          EMPTY_ADDRESS,
          makerAsset,
          takerAsset,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, 0, 0],
        ['0x0', '0x0', '0x0', '0x0'],
        '0x0',
        '0x0'
      )
      .send(defaultTxOpts);

    const order2Vals = getEventFromReceipt(
      order2.events,
      CONTRACT_NAMES.OASIS_DEX_EXCHANGE,
      'LogMake'
    );

    const activeOrder = await oasisDex.methods.offers(order2Vals.id).call();

    expect(activeOrder[2]).toEqual(takerQuantity);
    expect(activeOrder[0]).toEqual(makerQuantity);

    const activeOrderIdsOpenOrder2 = (await oasisDexAccessor.methods
      .getOrders(oasisDex.options.address, makerAsset, takerAsset)
      .call(defaultTxOpts))[0];

    expect(
      activeOrderIdsOpenOrder2.length - activeOrderIdsInitial.length
    ).toBe(1);

    await mln.methods
      .approve(oasisDex.options.address, takerQuantity)
      .send(defaultTxOpts);
    await oasisDex.methods
      .buy(order2Vals.id, makerQuantity)
      .send(defaultTxOpts);

    const activeOrderIdsClosedOrder2 = (await oasisDexAccessor.methods
      .getOrders(oasisDex.options.address, makerAsset, takerAsset)
      .call(defaultTxOpts))[0];

    expect(
      activeOrderIdsClosedOrder2.length - activeOrderIdsInitial.length
    ).toBe(0);
  });
});
