import { orderHashUtils } from '@0x/order-utils-v2';
import { AssetProxyId } from '@0x/types-v2';
import { toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import web3 from '~/deploy/utils/get-web3';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { setupInvestedTestFund } from '~/tests/utils/fund';
import {
  createUnsignedZeroExOrder,
  signZeroExOrder,
} from '~/tests/utils/zeroExV2';

describe('make0xOrder', () => {
  let user, defaultTxOpts;
  let exchange, exchangeIndex;
  let mln, weth;
  let routes;
  let trading;

  beforeEach(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };
    const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
    const contracts = deployed.contracts;
    routes = await setupInvestedTestFund(contracts, user);

    exchange = contracts[CONTRACT_NAMES.ZERO_EX_V2_EXCHANGE];
    const exchangeAdapter = contracts[CONTRACT_NAMES.ZERO_EX_V2_ADAPTER];
    mln = contracts.MLN;
    weth = contracts.WETH;
    trading = routes.trading;

    const exchanges = await trading.methods.getExchangeInfo().call();
    exchangeIndex = exchanges[1].findIndex(
      e => e.toLowerCase() === exchangeAdapter.options.address.toLowerCase()
    );
  });

  test('Make 0x order from fund and take it from account', async () => {
    const makerToken = weth;
    const takerToken = mln;
    const makerAssetAmount = toWei('0.05', 'ether');
    const takerAssetAmount = toWei('1', 'ether');

    const unsignedOrder = await createUnsignedZeroExOrder(
      exchange.options.address,
      {
        makerAddress: trading.options.address,
        makerTokenAddress: makerToken.options.address,
        makerAssetAmount,
        takerTokenAddress: takerToken.options.address,
        takerAssetAmount,
      },
    );

    const signedOrder = await signZeroExOrder(
      unsignedOrder,
      user,
    );

    const makeOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'makeOrder',
    );

    await trading.methods.callOnExchange(
      exchangeIndex,
      makeOrderSignature,
      [
        trading.options.address,
        EMPTY_ADDRESS,
        makerToken.options.address,
        takerToken.options.address,
        signedOrder.feeRecipientAddress,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS
      ],
      [
        signedOrder.makerAssetAmount,
        signedOrder.takerAssetAmount,
        signedOrder.makerFee,
        signedOrder.takerFee,
        signedOrder.expirationTimeSeconds,
        signedOrder.salt,
        0,
        0,
      ],
      [signedOrder.makerAssetData, signedOrder.takerAssetData, '0x0', '0x0'],
      '0x0',
      signedOrder.signature,
    ).send(defaultTxOpts);

    const erc20ProxyAddress = await exchange.methods
      .getAssetProxy(AssetProxyId.ERC20)
      .call();

    await takerToken.methods.approve(
      erc20ProxyAddress,
      unsignedOrder.takerAssetAmount,
    ).send(defaultTxOpts);

    const result = await exchange.methods
      .fillOrder(
        unsignedOrder,
        unsignedOrder.takerAssetAmount,
        signedOrder.signature,
      ).send(defaultTxOpts);

    expect(result).toBeTruthy();
  });

  test('Previously made 0x order cancelled and not takeable anymore', async () => {
    const makerToken = weth;
    const takerToken = mln;
    const makerAssetAmount = toWei('0.05', 'ether');
    const takerAssetAmount = toWei('1', 'ether');

    const unsignedOrder = await createUnsignedZeroExOrder(
      exchange.options.address,
      {
        makerAddress: trading.options.address,
        makerTokenAddress: makerToken.options.address,
        makerAssetAmount,
        takerTokenAddress: takerToken.options.address,
        takerAssetAmount,
      },
    );

    const signedOrder = await signZeroExOrder(
      unsignedOrder,
      user,
    );

    const makeOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'makeOrder',
    );

    await trading.methods.callOnExchange(
      exchangeIndex,
      makeOrderSignature,
      [
        trading.options.address,
        EMPTY_ADDRESS,
        makerToken.options.address,
        takerToken.options.address,
        signedOrder.feeRecipientAddress,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS
      ],
      [
        signedOrder.makerAssetAmount,
        signedOrder.takerAssetAmount,
        signedOrder.makerFee,
        signedOrder.takerFee,
        signedOrder.expirationTimeSeconds,
        signedOrder.salt,
        0,
        0,
      ],
      [signedOrder.makerAssetData, signedOrder.takerAssetData, '0x0', '0x0'],
      '0x0',
      signedOrder.signature,
    ).send(defaultTxOpts);

    const cancelOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'cancelOrder',
    );
    const orderHashHex = orderHashUtils.getOrderHashHex(signedOrder);

    await trading.methods
      .callOnExchange(
        exchangeIndex,
        cancelOrderSignature,
        [
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
        ],
        [0, 0, 0, 0, 0, 0, 0, 0],
        ['0x0', '0x0', '0x0', '0x0'],
        orderHashHex,
        '0x0',
      ).send(defaultTxOpts);

    await expect(
      exchange.methods
        .fillOrder(
          unsignedOrder,
          unsignedOrder.takerAssetAmount,
          signedOrder.signature,
        ).send(defaultTxOpts),
    ).rejects.toThrow('ORDER_UNFILLABLE');
  });

  test('Take off-chain order from fund', async () => {
    const makerToken = mln;
    const takerToken = weth;
    const makerAssetAmount = toWei('1', 'ether');
    const takerAssetAmount = toWei('0.05', 'ether');

    const unsignedOrder = await createUnsignedZeroExOrder(
      exchange.options.address,
      {
        makerAddress: user,
        makerTokenAddress: makerToken.options.address,
        makerAssetAmount,
        takerTokenAddress: takerToken.options.address,
        takerAssetAmount,
      },
    );

    const signedOrder = await signZeroExOrder(unsignedOrder, user);

    const takeOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'takeOrder',
    );
    const amount = toWei('0.02', 'ether');

    const erc20ProxyAddress = await exchange.methods
      .getAssetProxy(AssetProxyId.ERC20)
      .call();

    await makerToken.methods
      .approve(
        erc20ProxyAddress,
        unsignedOrder.makerAssetAmount,
      ).send(defaultTxOpts);

    await trading.methods
      .callOnExchange(
        exchangeIndex,
        takeOrderSignature,
        [
          signedOrder.makerAddress,
          EMPTY_ADDRESS,
          makerToken.options.address,
          takerToken.options.address,
          signedOrder.feeRecipientAddress,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
        ],
        [
          signedOrder.makerAssetAmount,
          signedOrder.takerAssetAmount,
          signedOrder.makerFee,
          signedOrder.takerFee,
          signedOrder.expirationTimeSeconds,
          signedOrder.salt,
          amount,
          0,
        ],
        [signedOrder.makerAssetData, signedOrder.takerAssetData, '0x0', '0x0'],
        '0x0',
        signedOrder.signature,
      ).send(defaultTxOpts);

    // TODO: expect(isEqual(order.takerFilledAmount, takerQuantity)).toBe(true);
  });
});
