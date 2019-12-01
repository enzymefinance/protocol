import { toWei, padLeft } from 'web3-utils';
import { AssetProxyId } from '@0x/types';
import { orderHashUtils } from '@0x/order-utils';

import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { deployAndInitTestEnv } from '~/tests/utils/deployAndInitTestEnv';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';

import { CONTRACT_NAMES, EXCHANGES } from '~/tests/utils/new/constants';
import { getContract } from '~/utils/solidity/getContract';

import { EMPTY_ADDRESS } from '~/tests/utils/new/constants';
import { getFunctionSignature } from '~/tests/utils/new/metadata';
import { increaseTime } from '~/tests/utils/new/rpc';
import {
  createUnsignedZeroExOrder,
  signZeroExOrder,
} from '~/tests/utils/new/zeroEx';

let environment, user, defaultTxOpts;
let zeroEx, zeroExWrapperLock;
let ethfinexConfig, exchange;
let signedOrder, unsignedOrder;
let exchangeIndex;
let trading;
let mlnInfo;

beforeEach(async () => {
  environment = await deployAndInitTestEnv();
  user = environment.wallet.address;
  defaultTxOpts = { from: user, gas: 8000000 };

  const wrapperRegistryEFXAddress =
    environment.deployment.thirdPartyContracts.exchanges.ethfinex.wrapperRegistryEFX;

  const routes = await setupInvestedTestFund(environment);

  mlnInfo = getTokenBySymbol(environment, 'MLN');

  trading = getContract(
    environment,
    CONTRACT_NAMES.TRADING,
    routes.tradingAddress
  );

  ethfinexConfig =
    environment.deployment.exchangeConfigs[EXCHANGES.ETHFINEX];

  exchange = getContract(
    environment,
    CONTRACT_NAMES.ZERO_EX_EXCHANGE,
    ethfinexConfig.exchange,
  );

  const zeroExInfo = getTokenBySymbol(environment, 'ZRX');

  zeroEx = getContract(
    environment,
    CONTRACT_NAMES.STANDARD_TOKEN,
    zeroExInfo.address
  );

  const wrapperRegistry = getContract(
    environment,
    CONTRACT_NAMES.WRAPPER_REGISTRY_EFX,
    wrapperRegistryEFXAddress,
  );

  const zeroExWrapperLockAddress = await wrapperRegistry.methods
    .token2WrapperLookup(zeroExInfo.address).call();

  zeroExWrapperLock = getContract(
    environment,
    CONTRACT_NAMES.WRAPPER_LOCK,
    zeroExWrapperLockAddress,
  );

  const hubAddress = await trading.methods.hub().call();
  const hub = getContract(environment, CONTRACT_NAMES.HUB, hubAddress);
  const newRoutes = await hub.methods.routes().call();
  const vaultAddress = newRoutes.vault;
  const amount = toWei('1', 'ether');

  await zeroEx.methods
    .transfer(vaultAddress, amount).send(defaultTxOpts);

  const makerAssetAmount = toWei('0.05', 'ether');
  const takerAssetAmount = toWei('1', 'ether');

  unsignedOrder = await createUnsignedZeroExOrder(
    ethfinexConfig.exchange,
    {
      makerAddress: newRoutes.trading,
      makerTokenAddress: zeroExWrapperLock.options.address,
      makerAssetAmount,
      takerTokenAddress: mlnInfo.address,
      takerAssetAmount,
    },
  );

  signedOrder = await signZeroExOrder(
    unsignedOrder,
    user,
  );

  const makerTokenAddress = await zeroExWrapperLock.methods
    .originalToken().call();

  const exchanges = await trading.methods.getExchangeInfo().call();
  exchangeIndex = exchanges[1].findIndex(
    e => e.toLowerCase() === ethfinexConfig.adapter.toLowerCase(),
  );

  const makeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'makeOrder',
  );

  await trading.methods.callOnExchange(
    exchangeIndex,
    makeOrderSignature,
    [
      newRoutes.trading,
      EMPTY_ADDRESS,
      makerTokenAddress,
      mlnInfo.address,
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

// tslint:disable-next-line:max-line-length
test('Make ethfinex order from fund and take it from account in which makerToken is a non-native asset', async () => {
  const erc20ProxyAddress = await exchange.methods
    .getAssetProxy(AssetProxyId.ERC20)
    .call();

  const mln = getContract(
    environment,
    CONTRACT_NAMES.STANDARD_TOKEN,
    mlnInfo.address,
  );

  await mln.methods
    .approve(erc20ProxyAddress, signedOrder.takerAssetAmount)
    .send(defaultTxOpts);

  const result = await exchange.methods
    .fillOrder(
      unsignedOrder,
      signedOrder.takerAssetAmount,
      signedOrder.signature,
    ).send(defaultTxOpts);

  expect(result).toBeTruthy();
});

// tslint:disable-next-line:max-line-length
test('Previously made ethfinex order cancelled and not takeable anymore', async () => {
  const cancelOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'cancelOrder',
  );

  const orderHashHex = orderHashUtils.getOrderHashHex(signedOrder)

  await trading.methods.callOnExchange(
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
        signedOrder.takerAssetAmount,
        signedOrder.signature,
      ).send(defaultTxOpts)
  ).rejects.toThrow('ORDER_UNFILLABLE');
});

test('Withdraw (unwrap) maker asset of cancelled order', async () => {
  increaseTime(25*60*60);

  const withdrawTokensSignature = getFunctionSignature(
    CONTRACT_NAMES.ETHFINEX_ADAPTER,
    'withdrawTokens',
  );

  const result = await trading.methods
    .callOnExchange(
      exchangeIndex,
      withdrawTokensSignature,
      [
        zeroEx.options.address,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
      ],
      [0, 0, 0, 0, 0, 0, 0, 0],
      '0x0',
      '0x0',
      '0x0',
      '0x0',
    ).send(defaultTxOpts);

  expect(result).toBeTruthy();
});
