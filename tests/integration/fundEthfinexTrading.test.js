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
import web3 from '~/deploy/utils/get-web3';

import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { stringToBytes } from '~/tests/utils/formatting';
import getAllBalances from '~/tests/utils/getAllBalances';
import getFundComponents from '~/tests/utils/getFundComponents';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { increaseTime } from '~/tests/utils/rpc';
import {
  createUnsignedZeroExOrder,
  signZeroExOrder,
} from '../utils/zeroExV2';

let accounts;
let deployer, manager, investor;
let defaultTxOpts, investorTxOpts, managerTxOpts;
let unsignedOrder, signedOrder;
let makeOrderSignature, cancelOrderSignature, withdrawTokensSignature;
let contracts, deployOut;
let fund;
let ethfinex, ethfinexAdapter, mln, weth, dgx, zrx, registry, version;
let ethTokenWrapper, mlnWrapper

beforeAll(async () => {
  accounts = await web3.eth.getAccounts();
  [deployer, manager, investor] = accounts;
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

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
  dgx = contracts.DGX;
  zrx = contracts.ZRX;
  version = contracts.Version;
  registry = contracts.Registry;
  mlnWrapper = contracts['W-MLN'];
  ethTokenWrapper = contracts.WrapperLockEth;

  // TODO: use less fake prices
  const fakePrices = Object.values(deployOut.tokens.addr).map(() => (new BN('10')).pow(new BN('18')).toString());
  await contracts.TestingPriceFeed.methods.update(Object.values(deployOut.tokens.addr), fakePrices);

  const fundName = stringToBytes('Test fund', 32);
  await version.methods
    .beginSetup(
      fundName,
      [],
      [],
      [],
      [ethfinex.options.address],
      [ethfinexAdapter.options.address],
      weth.options.address,
      [weth.options.address, mln.options.address],
    ).send(managerTxOpts);
  await version.methods.createAccounting().send(managerTxOpts);
  await version.methods.createFeeManager().send(managerTxOpts);
  await version.methods.createParticipation().send(managerTxOpts);
  await version.methods.createPolicyManager().send(managerTxOpts);
  await version.methods.createShares().send(managerTxOpts);
  await version.methods.createTrading().send(managerTxOpts);
  await version.methods.createVault().send(managerTxOpts);
  const res = await version.methods.completeSetup().send(managerTxOpts);
  const hubAddress = res.events.NewFund.returnValues.hub;
  fund = await getFundComponents(hubAddress);

  const wrapperRegistry = contracts.WrapperRegistryEFX;

  // Send WETH to investor and ZRX directly to fund
  await weth.methods
    .transfer(investor, toWei('10', 'Ether'))
    .send(defaultTxOpts);
  await zrx.methods
    .transfer(fund.vault.options.address, toWei('200', 'Ether'))
    .send(defaultTxOpts);

  // Investor participates in fund
  const offeredValue = toWei('1', 'ether');
  const wantedShares = toWei('1', 'ether');
  await weth.methods
    .approve(fund.participation.options.address, offeredValue)
    .send(investorTxOpts);
  await fund.participation.methods
    .requestInvestment(
      offeredValue,
      wantedShares,
      weth.options.address,
    )
    .send({ ...investorTxOpts, value: toWei('.01', 'ether') });
  await fund.participation.methods
    .executeRequestFor(investor)
    .send(investorTxOpts);
});

test('Make order through the fund', async () => {
  await mln.methods
    .transfer(fund.vault.options.address, toWei('1', 'ether'))
    .send(defaultTxOpts);

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
  const preCalculations = await fund.accounting.methods
    .performCalculations()
    .call();
  signedOrder = await signZeroExOrder(order, manager);

  await fund.trading.methods
    .callOnExchange(
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
    )
    .send(managerTxOpts);

  const postCalculations = await fund.accounting.methods
    .performCalculations()
    .call();
  const isValidSignatureBeforeMake = await ethfinex.methods
    .isValidSignature(
      orderHashHex,
      fund.trading.options.address,
      signedOrder.signature,
    )
    .call();

  expect(isValidSignatureBeforeMake).toBeTruthy();
  expect(postCalculations.gav).toBe(preCalculations.gav);
  expect(postCalculations.sharePrice).toBe(preCalculations.sharePrice);
});

test('Third party takes the order made by the fund', async () => {
  const pre = await getAllBalances(contracts, accounts, fund);
  const preDeployerWrappedMLN = new BN(
    await mlnWrapper.methods.balanceOf(deployer).call(),
  );

  const erc20ProxyAddress = await ethfinex.methods
    .getAssetProxy(AssetProxyId.ERC20.toString())
    .call();

  await weth.methods
    .approve(erc20ProxyAddress, signedOrder.takerAssetAmount)
    .send(defaultTxOpts);

  const result = await ethfinex.methods
    .fillOrder(
      signedOrder,
      signedOrder.takerAssetAmount,
      signedOrder.signature,
    ).send(defaultTxOpts);

  const post = await getAllBalances(contracts, accounts, fund);
  const postDeployerWrappedMLN = new BN(
    await mlnWrapper.methods.balanceOf(deployer).call(),
  );

  const bnMakerAssetAmount = new BN(signedOrder.makerAssetAmount);
  const bnTakerAssetAmount = new BN(signedOrder.takerAssetAmount);

  expect(result).toBeTruthy();
  expect(post.fund.mln).bigNumberEq(pre.fund.mln.sub(bnMakerAssetAmount));
  expect(post.fund.weth).bigNumberEq(pre.fund.weth.add(bnTakerAssetAmount));
  expect(postDeployerWrappedMLN).bigNumberEq(
    preDeployerWrappedMLN.add(bnMakerAssetAmount),
  );
  expect(post.deployer.weth).bigNumberEq(pre.deployer.weth.sub(bnTakerAssetAmount));
});

test('Make order with native asset', async () => {
  const pre = await getAllBalances(contracts, accounts, fund);
  const preCalculations = await fund.accounting.methods
    .performCalculations()
    .call();
  const preIsDgxInAssetList = await fund.accounting.methods
    .isInAssetList(dgx.options.address)
    .call();

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
      takerTokenAddress: dgx.options.address,
      takerAssetAmount,
    },
  );
  signedOrder = await signZeroExOrder(unsignedOrder, manager);
  await fund.trading.methods
    .callOnExchange(
      0,
      makeOrderSignature,
      [
        makerAddress,
        EMPTY_ADDRESS,
        weth.options.address,
        dgx.options.address,
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
    )
    .send(managerTxOpts);
  const post = await getAllBalances(contracts, accounts, fund);
  const postCalculations = await fund.accounting.methods
    .performCalculations()
    .call();
  const postIsDgxInAssetList = await fund.accounting.methods
    .isInAssetList(dgx.options.address)
    .call();
  const openOrdersAgainstDgx = await fund.trading.methods
    .openMakeOrdersAgainstAsset(dgx.options.address)
    .call();

  expect(postCalculations.gav).toBe(preCalculations.gav);
  expect(postCalculations.sharePrice).toBe(preCalculations.sharePrice);
  expect(post.fund.weth).bigNumberEq(pre.fund.weth);
  expect(postIsDgxInAssetList).toBeTruthy();
  expect(preIsDgxInAssetList).toBeFalsy();
  expect(Number(openOrdersAgainstDgx)).toBe(1);
});

test('Anticipated taker asset is not removed from owned assets', async () => {
  await fund.accounting.methods
    .performCalculations()
    .send(managerTxOpts);
  await fund.accounting.methods
    .updateOwnedAssets()
    .send(managerTxOpts);

  const isDgxInAssetList = await fund.accounting.methods
    .isInAssetList(dgx.options.address)
    .call();

  expect(isDgxInAssetList).toBeTruthy();
});

test('Cancel the order and withdraw tokens', async () => {
  const orderHashHex = orderHashUtils.getOrderHashHex(signedOrder);
  const pre = await getAllBalances(contracts, accounts, fund);
  const preCalculations = await fund.accounting.methods
    .performCalculations()
    .call();
  await fund.trading.methods
    .callOnExchange(
      0,
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
    )
    .send(managerTxOpts);
  const isOrderCancelled = await ethfinex.methods
    .cancelled(orderHashHex)
    .call();

  expect(isOrderCancelled).toBeTruthy();

  const preWithdraw = await getAllBalances(contracts, accounts, fund);
  const preWithdrawCalculations = await fund.accounting.methods
    .performCalculations()
    .call();

  await increaseTime(25 * 60 * 60);

  await fund.trading.methods
    .callOnExchange(
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
    )
    .send(managerTxOpts);

  // To clean up asset list
  await fund.accounting.methods
    .performCalculations()
    .send(managerTxOpts);
  await fund.accounting.methods
    .updateOwnedAssets()
    .send(managerTxOpts);

  const post = await getAllBalances(contracts, accounts, fund);
  const postCalculations = await fund.accounting.methods
    .performCalculations()
    .call();
  const isDgxInAssetList = await fund.accounting.methods
    .isInAssetList(dgx.options.address)
    .call();
  const openOrdersAgainstDgx = await fund.trading.methods
    .openMakeOrdersAgainstAsset(dgx.options.address)
    .call();

  expect(post.fund.weth).bigNumberEq(preWithdraw.fund.weth);
  expect(preWithdraw.fund.weth).bigNumberEq(pre.fund.weth);
  expect(postCalculations.gav).toBe(preWithdrawCalculations.gav);
  expect(preWithdrawCalculations.gav).toBe(preCalculations.gav);
  expect(postCalculations.sharePrice).toBe(
    preWithdrawCalculations.sharePrice,
  );
  expect(preWithdrawCalculations.sharePrice).toBe(
    preCalculations.sharePrice,
  );
  expect(isDgxInAssetList).toBeFalsy();
  expect(Number(openOrdersAgainstDgx)).toBe(0);
});
