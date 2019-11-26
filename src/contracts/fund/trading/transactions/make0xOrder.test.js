import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { deployAndInitTestEnv } from '~/tests/utils/deployAndInitTestEnv';
import { AssetProxyId } from '@0x/types';
import { orderHashUtils } from '@0x/order-utils';
import {
  createUnsignedZeroExOrder,
  signZeroExOrder,
} from '~/tests/utils/new/zeroEx';
import { toWei, padLeft } from 'web3-utils';
import { getContract } from '~/utils/solidity/getContract';
import { CONTRACT_NAMES, EXCHANGES } from '~/tests/utils/new/constants';
import { getFunctionSignature } from '~/tests/utils/new/metadata';
import { EMPTY_ADDRESS } from '~/tests/utils/new/constants';

describe('make0xOrder', () => {
  let environment, user, defaultTxOpts;
  let makerToken, takerToken;
  let exchange, exchangeIndex;
  let unsignedOrder, signedOrder;
  let routes;
  let trading;

  beforeEach(async () => {
    environment = await deployAndInitTestEnv();
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };
    routes = await setupInvestedTestFund(environment);

    const exchangeConfig =
      environment.deployment.exchangeConfigs[EXCHANGES.ZERO_EX];

    exchange = getContract(
      environment,
      CONTRACT_NAMES.ZERO_EX_EXCHANGE,
      exchangeConfig.exchange,
    );

    const wethInfo = getTokenBySymbol(environment, 'WETH');
    const mlnInfo = getTokenBySymbol(environment, 'MLN');

    makerToken = getContract(
      environment,
      CONTRACT_NAMES.STANDARD_TOKEN,
      wethInfo.address,
    );

    takerToken = getContract(
      environment,
      CONTRACT_NAMES.STANDARD_TOKEN,
      mlnInfo.address,
    );

    trading = getContract(
      environment,
      CONTRACT_NAMES.TRADING,
      routes.tradingAddress,
    );

    const exchanges = await trading.methods.getExchangeInfo().call();
    exchangeIndex = exchanges[1].findIndex(
      e => e.toLowerCase() === exchangeConfig.adapter.toLowerCase(),
    );

    const makeOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'makeOrder',
    );

    const makerAssetAmount = toWei('0.05', 'ether');
    const takerAssetAmount = toWei('1', 'ether');

    unsignedOrder = await createUnsignedZeroExOrder(
      environment,
      exchange.options.address,
      {
        makerAddress: routes.tradingAddress,
        makerTokenAddress: makerToken.options.address,
        makerAssetAmount,
        takerTokenAddress: takerToken.options.address,
        takerAssetAmount,
      },
    );

    signedOrder = await signZeroExOrder(
      environment,
      unsignedOrder,
      user,
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
      padLeft('0x0', 64),
      signedOrder.makerAssetData,
      signedOrder.takerAssetData,
      signedOrder.signature,
    ).send(defaultTxOpts);
  });

  it('Make 0x order from fund and take it from account', async () => {
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

  // tslint:disable-next-line:max-line-length
  it('Previously made 0x order cancelled and not takeable anymore', async () => {
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
        ],
        [0, 0, 0, 0, 0, 0, 0, 0],
        orderHashHex,
        '0x0',
        '0x0',
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
});

