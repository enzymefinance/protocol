/*
 * @file Tests funds trading via the Ethfinex Adapter
 * @dev This file is intended only for tests that will not work on a testnet (e.g., increaseTime)
 *
 * @test Make order with native asset
 * @test Anticipated taker asset is not removed from owned assets
 * @test Cancel the order and withdraw tokens
 */

import { orderHashUtils } from '@0x/order-utils-v2';
import { BN, toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { call, send } from '~/deploy/utils/deploy-contract';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { increaseTime } from '~/tests/utils/rpc';
import {
  createUnsignedZeroExOrder,
  signZeroExOrder,
} from '~/tests/utils/zeroExV2';

let accounts;
let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let unsignedOrder, signedOrder;
let makeOrderSignature, cancelOrderSignature, withdrawTokensSignature;
let contracts, deployOut;
let fund;
let ethfinex, ethfinexAdapter, mln, weth, knc, zrx, version;
let ethTokenWrapper;

beforeAll(async () => {
  accounts = await getAccounts();
  [deployer, manager, investor] = accounts;
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  const deployed = await partialRedeploy(CONTRACT_NAMES.VERSION);
  deployOut = deployed.deployOut;
  contracts = deployed.contracts;

  makeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'makeOrder',
  );

  cancelOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'cancelOrder',
  );

  withdrawTokensSignature = getFunctionSignature(
    CONTRACT_NAMES.ETHFINEX_ADAPTER,
    'withdrawTokens',
  );

  ethfinex = contracts.ZeroExV2Exchange;
  ethfinexAdapter = contracts.EthfinexAdapter;
  mln = contracts.MLN;
  weth = contracts.WETH;
  knc = contracts.KNC;
  zrx = contracts.ZRX;
  version = contracts.Version;
  ethTokenWrapper = contracts.WrapperLockEth;

  // TODO: use less fake prices
  const fakePrices = Object.values(deployOut.tokens.addr).map(() => (new BN('10')).pow(new BN('18')).toString());
  await contracts.TestingPriceFeed.methods.update(Object.values(deployOut.tokens.addr), fakePrices);

  await send(weth, 'transfer', [investor, toWei('10', 'ether')], defaultTxOpts);

  fund = await setupFundWithParams({
    defaultTokens: [weth.options.address, mln.options.address],
    exchanges: [ethfinex.options.address],
    exchangeAdapters: [ethfinexAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    version
  });

  await send(zrx, 'transfer', [fund.vault.options.address, toWei('200', 'ether')], defaultTxOpts);
});

test('Make order with native asset', async () => {
  const preFundWeth = new BN(await call(fund.accounting, 'assetHoldings', [weth.options.address]));
  const preCalculations = await call(fund.accounting, 'performCalculations');
  const preIsKncInAssetList = await call(
    fund.accounting, 'isInAssetList', [knc.options.address]
  );

  const makerAddress = fund.trading.options.address.toLowerCase();
  const makerAssetAmount = toWei('.05', 'ether');
  const takerAssetAmount = toWei('.5', 'ether');
  unsignedOrder = await createUnsignedZeroExOrder(
    ethfinex.options.address,
    {
      feeRecipientAddress: investor,
      makerAddress,
      makerTokenAddress: ethTokenWrapper.options.address,
      makerAssetAmount,
      takerTokenAddress: knc.options.address,
      takerAssetAmount,
    },
  );
  signedOrder = await signZeroExOrder(unsignedOrder, manager);
  await send(
    fund.trading,
    'callOnExchange',
    [
      0,
      makeOrderSignature,
      [
        makerAddress,
        EMPTY_ADDRESS,
        weth.options.address,
        knc.options.address,
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
    ],
    managerTxOpts
  );
  const postFundWeth = new BN(await call(fund.accounting, 'assetHoldings', [weth.options.address]));
  const postCalculations = await call(fund.accounting, 'performCalculations');
  const postIsKncInAssetList = await call(
    fund.accounting, 'isInAssetList', [knc.options.address]
  );
  const openOrdersAgainstKnc = await call(
    fund.trading, 'openMakeOrdersAgainstAsset', [knc.options.address]
  );

  expect(postCalculations.gav).toBe(preCalculations.gav);
  expect(postCalculations.sharePrice).toBe(preCalculations.sharePrice);
  expect(postFundWeth).bigNumberEq(preFundWeth);
  expect(postIsKncInAssetList).toBeTruthy();
  expect(preIsKncInAssetList).toBeFalsy();
  expect(Number(openOrdersAgainstKnc)).toBe(1);
});

test('Anticipated taker asset is not removed from owned assets', async () => {
  await send(fund.accounting, 'performCalculations', [], managerTxOpts);
  await send(fund.accounting, 'updateOwnedAssets', [], managerTxOpts);

  const isKncInAssetList = await call(
    fund.accounting, 'isInAssetList', [knc.options.address]
  );

  expect(isKncInAssetList).toBeTruthy();
});

test('Cancel the order and withdraw tokens', async () => {
  const orderHashHex = orderHashUtils.getOrderHashHex(signedOrder);
  const preCalculations = await call(fund.accounting, 'performCalculations');
  await send(
    fund.trading,
    'callOnExchange',
    [
      0,
      cancelOrderSignature,
      [
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        weth.options.address,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS
      ],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [signedOrder.makerAssetData, '0x0', '0x0', '0x0'],
      orderHashHex,
      '0x0',
    ],
    managerTxOpts
  );
  const isOrderCancelled = await call(ethfinex, 'cancelled', [orderHashHex]);

  expect(isOrderCancelled).toBeTruthy();

  const preWithdrawFundWeth = new BN(await call(fund.accounting, 'assetHoldings', [weth.options.address]));
  const preWithdrawCalculations = await call(fund.accounting, 'performCalculations');

  await increaseTime(25 * 60 * 60);

  await send(
    fund.trading,
    'callOnExchange',
    [
      0,
      withdrawTokensSignature,
      [
        weth.options.address,
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
    ],
    managerTxOpts
  );

  // To clean up asset list
  await send(fund.accounting, 'performCalculations', [], managerTxOpts);
  await send(fund.accounting, 'updateOwnedAssets', [], managerTxOpts);

  const postWithdrawFundWeth = new BN(await call(fund.accounting, 'assetHoldings', [weth.options.address]));
  const postCalculations = await call(fund.accounting, 'performCalculations');
  const isKncInAssetList = await call(
    fund.accounting, 'isInAssetList', [knc.options.address]
  );
  const openOrdersAgainstKnc = await call(
    fund.trading, 'openMakeOrdersAgainstAsset', [knc.options.address]
  );

  expect(postWithdrawFundWeth).bigNumberEq(preWithdrawFundWeth);
  expect(postCalculations.gav).toBe(preWithdrawCalculations.gav);
  expect(preWithdrawCalculations.gav).toBe(preCalculations.gav);
  expect(postCalculations.sharePrice).toBe(
    preWithdrawCalculations.sharePrice,
  );
  expect(preWithdrawCalculations.sharePrice).toBe(
    preCalculations.sharePrice,
  );
  expect(isKncInAssetList).toBeFalsy();
  expect(Number(openOrdersAgainstKnc)).toBe(0);
});
