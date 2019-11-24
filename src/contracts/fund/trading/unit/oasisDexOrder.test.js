import { BN, toWei } from 'web3-utils';

import { deployAndInitTestEnv } from '~/tests/utils/deployAndInitTestEnv';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { getContract } from '~/utils/solidity/getContract';

import {
  CONTRACT_NAMES,
  EMPTY_ADDRESS,
  EXCHANGES
} from '~/tests/utils/new/constants';
import { stringToBytes } from '~/tests/utils/new/formatting';
import {
  getEventFromReceipt,
  getFunctionSignature
} from '~/tests/utils/new/metadata';

describe('make-oasis-dex-order', () => {
  let environment, user, defaultTxOpts;
  let mlnTokenInfo, routes, wethTokenInfo;
  let mln, oasisDex, oasisDexAccessor, trading;
  let exchangeIndex;

  beforeAll(async () => {
    environment = await deployAndInitTestEnv();
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };

    routes = await setupInvestedTestFund(environment);
    const oasisDexAddresses =
      environment.deployment.exchangeConfigs[EXCHANGES.OASIS_DEX];

    oasisDex = getContract(
      environment,
      CONTRACT_NAMES.OASIS_DEX_EXCHANGE,
      oasisDexAddresses.exchange
    );

    oasisDexAccessor = getContract(
      environment,
      CONTRACT_NAMES.OASIS_DEX_ACCESSOR,
      environment.deployment.melonContracts.adapters.matchingMarketAccessor
    );

    trading = getContract(
      environment,
      CONTRACT_NAMES.TRADING,
      routes.tradingAddress
    );

    const tokenInfo = environment.deployment.thirdPartyContracts.tokens;
    wethTokenInfo = tokenInfo.find(token => token.symbol === 'WETH');
    mlnTokenInfo = tokenInfo.find(token => token.symbol === 'MLN');

    mln = getContract(
      environment,
      CONTRACT_NAMES.STANDARD_TOKEN,
      mlnTokenInfo.address
    );

    const exchangeInfo = await trading.methods.getExchangeInfo().call();
    exchangeIndex = exchangeInfo[1].findIndex(
      e => e.toLowerCase() === oasisDexAddresses.adapter.toLowerCase(),
    );
  });

  it('make oasisdex order', async () => {
    const makerAsset = wethTokenInfo.address;
    const makerQuantity = toWei('0.05', 'ether');
    const takerAsset = mlnTokenInfo.address;
    const takerQuantity = toWei('1', 'ether');

    const makeOrderFunctionSig = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'makeOrder',
    );
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
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, 0, 0],
        stringToBytes('0', 32),
        stringToBytes('0', 32),
        stringToBytes('0', 32),
        stringToBytes('0', 32),
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
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, 0, 0],
          stringToBytes('0', 32),
          stringToBytes('0', 32),
          stringToBytes('0', 32),
          stringToBytes('0', 32),
        )
        .send(defaultTxOpts)
    ).rejects.toThrow();

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
        ],
        [0, 0, 0, 0, 0, 0, 0, 0],
        order1Vals.id,
        stringToBytes('0', 32),
        stringToBytes('0', 32),
        stringToBytes('0', 32),
      )
      .send(defaultTxOpts);

    // Increment next block time
    environment.eth.currentProvider.send(
      {
        id: 123,
        jsonrpc: '2.0',
        method: 'evm_increaseTime',
        params: [60 * 30], // 30 mins
      },
      (err, res) => {},
    );

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
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, 0, 0],
        stringToBytes('0', 32),
        stringToBytes('0', 32),
        stringToBytes('0', 32),
        stringToBytes('0', 32),
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

    let activeOrderIds = (await oasisDexAccessor.methods
      .getOrders(oasisDex.options.address, makerAsset, takerAsset)
      .call(defaultTxOpts))[0];

    expect(activeOrderIds.length).toBe(1);

    await mln.methods
      .approve(oasisDex.options.address, takerQuantity)
      .send(defaultTxOpts);
    await oasisDex.methods
      .buy(order2Vals.id, makerQuantity)
      .send(defaultTxOpts);

    activeOrderIds = (await oasisDexAccessor.methods
      .getOrders(oasisDex.options.address, makerAsset, takerAsset)
      .call(defaultTxOpts))[0];

    expect(activeOrderIds.length).toBe(0);
  });
});
