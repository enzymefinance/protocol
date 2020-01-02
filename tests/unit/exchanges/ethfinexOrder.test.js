import { AssetProxyId } from '@0x/types-v2';
import { orderHashUtils } from '@0x/order-utils-v2';
import { toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import web3 from '~/deploy/utils/get-web3';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { increaseTime } from '~/tests/utils/rpc';
import setupInvestedTestFund from '~/tests/utils/setupInvestedTestFund';
import {
  createUnsignedZeroExOrder,
  signZeroExOrder,
} from '~/tests/utils/zeroExV2';

let user, defaultTxOpts;
let zrxWrapperLock;
let exchange;
let signedOrder, unsignedOrder;
let exchangeIndex;
let trading;
let mln, zrx;

beforeEach(async () => {
  const accounts = await web3.eth.getAccounts();
  user = accounts[0];
  defaultTxOpts = { from: user, gas: 8000000 };

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  const contracts = deployed.contracts;
  const routes = await setupInvestedTestFund(contracts, user);

  trading = routes.trading;
  mln = contracts.MLN;
  zrx = contracts.ZRX;
  exchange = contracts[CONTRACT_NAMES.ZERO_EX_V2_EXCHANGE];
  zrxWrapperLock = contracts['W-ZRX'];
  const ethfinexAdapter = contracts[CONTRACT_NAMES.ETHFINEX_ADAPTER];

  const amount = toWei('1', 'ether');

  await zrx.methods
    .transfer(routes.vault.options.address, amount).send(defaultTxOpts);

  const makerAssetAmount = toWei('0.05', 'ether');
  const takerAssetAmount = toWei('1', 'ether');

  unsignedOrder = await createUnsignedZeroExOrder(
    exchange.options.address,
    {
      makerAddress: routes.trading.options.address,
      makerTokenAddress: zrxWrapperLock.options.address,
      makerAssetAmount,
      takerTokenAddress: mln.options.address,
      takerAssetAmount,
    },
  );

  signedOrder = await signZeroExOrder(
    unsignedOrder,
    user,
  );

  const makerTokenAddress = await zrxWrapperLock.methods
    .originalToken().call();

  const exchanges = await trading.methods.getExchangeInfo().call();
  exchangeIndex = exchanges[1].findIndex(
    e => e.toLowerCase() === ethfinexAdapter.options.address.toLowerCase(),
  );

  const makeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'makeOrder',
  );

  await trading.methods.callOnExchange(
    exchangeIndex,
    makeOrderSignature,
    [
      routes.trading.options.address,
      EMPTY_ADDRESS,
      makerTokenAddress,
      mln.options.address,
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
});

// tslint:disable-next-line:max-line-length
test('Make ethfinex order from fund and take it from account in which makerToken is a non-native asset', async () => {
  const erc20ProxyAddress = await exchange.methods
    .getAssetProxy(AssetProxyId.ERC20)
    .call();

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
        signedOrder.takerAssetAmount,
        signedOrder.signature,
      ).send(defaultTxOpts)
  ).rejects.toThrow('ORDER_UNFILLABLE');
});

test('Withdraw (unwrap) maker asset of cancelled order', async () => {
  // skip past order expiration
  const depositLockEnd = await zrxWrapperLock.methods.depositLock(
    trading.options.address
  ).call();
  const latestBlockTimestamp = (await web3.eth.getBlock()).timestamp;
  await increaseTime(depositLockEnd - latestBlockTimestamp + 1);

  const withdrawTokensSignature = getFunctionSignature(
    CONTRACT_NAMES.ETHFINEX_ADAPTER,
    'withdrawTokens',
  );

  const zrxBalance = await zrx.methods.balanceOf(trading.options.address).call();
  const result = await trading.methods
    .callOnExchange(
      exchangeIndex,
      withdrawTokensSignature,
      [
        zrx.options.address,
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
      '0x0',
      '0x0',
    ).send(defaultTxOpts);

  expect(result).toBeTruthy();
});
