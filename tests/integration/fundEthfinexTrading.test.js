/*
 * @file Tests funds trading via the Ethfinex adapter
 *
 * @test Fund makes an order, taken by third party
 * @test Fund makes an order with the native asset (ETH)
 * @test Taker asset in open maker order is included in ownedAssets
 * @test Fund cancels an order and withdraws funds
 * @test TODO: Fund takes an order
 * @test TODO: second order with same asset pair
 * @test TODO: order expiry
 */

import { orderHashUtils } from '@0x/order-utils-v2';
import { AssetProxyId } from '@0x/types-v2';
import { BN, toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { call, send } from '~/deploy/utils/deploy-contract';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { getFunctionSignature } from '~/tests/utils/metadata';
import {
  createUnsignedZeroExOrder,
  signZeroExOrder,
} from '~/tests/utils/zeroExV2';

let accounts;
let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let signedOrder;
let makeOrderSignature;
let contracts, deployOut;
let fund;
let ethfinex, ethfinexAdapter, mln, weth, zrx, version;
let mlnWrapper;

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

  ethfinex = contracts.ZeroExV2Exchange;
  ethfinexAdapter = contracts.EthfinexAdapter;
  mln = contracts.MLN;
  weth = contracts.WETH;
  zrx = contracts.ZRX;
  version = contracts.Version;
  mlnWrapper = contracts['W-MLN'];

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

test('Make order through the fund', async () => {
  await send(mln, 'transfer', [fund.vault.options.address, toWei('1', 'ether')], defaultTxOpts);

  const makerAddress = fund.trading.options.address.toLowerCase();
  const makerAssetAmount = toWei('1', 'ether');
  const takerAssetAmount = toWei('.1', 'ether');

  const order = await createUnsignedZeroExOrder(
    ethfinex.options.address,
    {
      makerAddress,
      makerTokenAddress: mlnWrapper.options.address,
      makerAssetAmount,
      takerTokenAddress: weth.options.address,
      takerAssetAmount,
    },
  );

  const orderHashHex = orderHashUtils.getOrderHashHex(order);
  const preCalculations = await call(fund.accounting, 'performCalculations');
  signedOrder = await signZeroExOrder(order, manager);

  await send(
    fund.trading,
    'callOnExchange',
    [
      0,
      makeOrderSignature,
      [
        makerAddress,
        EMPTY_ADDRESS,
        mln.options.address,
        weth.options.address,
        order.feeRecipientAddress,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS
      ],
      [
        order.makerAssetAmount,
        order.takerAssetAmount,
        order.makerFee,
        order.takerFee,
        order.expirationTimeSeconds,
        order.salt,
        0,
        0,
      ],
      [signedOrder.makerAssetData, signedOrder.takerAssetData, '0x0', '0x0'],
      '0x0',
      signedOrder.signature,
    ],
    managerTxOpts
  );

  const postCalculations = await call(fund.accounting, 'performCalculations');
  const isValidSignatureBeforeMake = await call(
    ethfinex,
    'isValidSignature',
    [ orderHashHex, fund.trading.options.address, signedOrder.signature ]
  );

  expect(isValidSignatureBeforeMake).toBeTruthy();
  expect(postCalculations.gav).toBe(preCalculations.gav);
  expect(postCalculations.sharePrice).toBe(preCalculations.sharePrice);
});

test('Third party takes the order made by the fund', async () => {
  const preDeployerWrappedMLN = new BN(
    await call(mlnWrapper, 'balanceOf', [deployer]),
  );
  const preFundMln = new BN(await call(fund.accounting, 'assetHoldings', [mln.options.address]));
  const preFundWeth = new BN(await call(fund.accounting, 'assetHoldings', [weth.options.address]));
  const preDeployerWeth = new BN(await call(weth, 'balanceOf', [deployer]));

  const erc20ProxyAddress = await call(ethfinex, 'getAssetProxy', [AssetProxyId.ERC20.toString()]);

  await send(weth, 'approve', [erc20ProxyAddress, signedOrder.takerAssetAmount], defaultTxOpts);

  const result = await send(
    ethfinex,
    'fillOrder',
    [signedOrder, signedOrder.takerAssetAmount, signedOrder.signature],
    defaultTxOpts
  );

  const postFundMln = new BN(await call(fund.accounting, 'assetHoldings', [mln.options.address]));
  const postFundWeth = new BN(await call(fund.accounting, 'assetHoldings', [weth.options.address]));
  const postDeployerWeth = new BN(await call(weth, 'balanceOf', [deployer]));
  const postDeployerWrappedMLN = new BN(
    await call(mlnWrapper, 'balanceOf', [deployer]),
  );

  const bnMakerAssetAmount = new BN(signedOrder.makerAssetAmount);
  const bnTakerAssetAmount = new BN(signedOrder.takerAssetAmount);

  expect(result).toBeTruthy();
  expect(postFundMln).bigNumberEq(preFundMln.sub(bnMakerAssetAmount));
  expect(postFundWeth).bigNumberEq(preFundWeth.add(bnTakerAssetAmount));
  expect(postDeployerWrappedMLN).bigNumberEq(
    preDeployerWrappedMLN.add(bnMakerAssetAmount),
  );
  expect(postDeployerWeth).bigNumberEq(preDeployerWeth.sub(bnTakerAssetAmount));
});
