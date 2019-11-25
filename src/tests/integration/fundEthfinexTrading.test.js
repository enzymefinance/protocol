import { orderHashUtils } from '@0x/order-utils';
import { fillOrder } from '~/contracts/exchanges/third-party/0x/transactions/fillOrder';
import { getAssetProxy } from '~/contracts/exchanges/third-party/0x/calls/getAssetProxy';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { randomHexOfSize } from '~/utils/helpers/randomHexOfSize';
import { withDifferentAccount } from '~/utils/environment/withDifferentAccount';
import { deployContract } from '~/utils/solidity/deployContract';
import { getContract } from '~/utils/solidity/getContract';
import { getFunctionSignature } from '../utils/new/metadata';
import { CONTRACT_NAMES, EXCHANGES } from '../utils/new/constants';
import {
  createUnsignedZeroExOrder,
  signZeroExOrder,
} from '../utils/new/zeroEx';
import { increaseTime } from '~/utils/evm';
const getFundComponents = require('../utils/new/getFundComponents');
const getAllBalances = require('../utils/new/getAllBalances');
import { BN, toWei, padLeft, stringToHex } from 'web3-utils';
// import { deployAndGetSystem } from '~/tests/utils/deployAndGetSystem';
const deploySystem = require('../../../new/deploy/deploy-system');
const web3 = require('../../../new/deploy/get-web3');

// mock data
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'; // TODO: import from utils

let accounts;
let deployer, manager, investor;
let defaultTxOpts, investorTxOpts, managerTxOpts;
let mlnTokenWrapperInfo, ethTokenWrapperInfo;
let unsignedOrder, signedOrder;
let makeOrderSignature, cancelOrderSignature, withdrawTokensSignature;
let contracts, deployOut;
let fund;
let ethfinex, ethfinexAdapter, mln, weth, dgx, zrx, fundFactory, registry, mlnWrapper;

beforeAll(async () => {
  accounts = await web3.eth.getAccounts();
  [deployer, manager, investor] = accounts;

  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

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

  const deployment = await deploySystem(JSON.parse(require('fs').readFileSync(process.env.CONF))); // TODO: change from reading file each time
  contracts = deployment.contracts;
  deployOut = deployment.deployOut;

  ethfinex = contracts.Exchange;
  ethfinexAdapter = contracts.EthfinexAdapter;
  mln = contracts.MLN;
  weth = contracts.WETH;
  dgx = contracts.DGX;
  zrx = contracts.ZRX;
  fundFactory = contracts.Version;
  registry = contracts.Registry;
  mlnWrapper = contracts['W-MLN'];

  const erc20ProxyAddress = contracts.ERC20Proxy.options.address;

  // TODO: use less fake prices
  const fakePrices = Object.values(deployOut.tokens.addr).map(() => (new BN('10')).pow(new BN('18')).toString());
  await contracts.TestingPriceFeed.methods.update(Object.values(deployOut.tokens.addr), fakePrices);

  const fundName = padLeft(stringToHex('Test fund'), 64);
  await fundFactory.methods
    .beginSetup(
      fundName,
      [],
      [],
      [],
      [ethfinex.options.address],
      [ethfinexAdapter.options.address],
      weth.options.address,
      [weth.options.address, mln.options.address],
    )
    .send(managerTxOpts);

  await fundFactory.methods.createAccounting().send(managerTxOpts);
  await fundFactory.methods.createFeeManager().send(managerTxOpts);
  await fundFactory.methods.createParticipation().send(managerTxOpts);
  await fundFactory.methods.createPolicyManager().send(managerTxOpts);
  await fundFactory.methods.createShares().send(managerTxOpts);
  await fundFactory.methods.createTrading().send(managerTxOpts);
  await fundFactory.methods.createVault().send(managerTxOpts);
  const res = await fundFactory.methods.completeSetup().send(managerTxOpts);
  const hubAddress = res.events.NewFund.returnValues.hub;

  fund = await getFundComponents(hubAddress);
  // await updateTestingPriceFeed(contracts, environment);

  const wrapperRegistry = contracts.WrapperRegistryEFX;

  // ethTokenWrapperInfo = await getToken(
  //   environment,
  //   await deployContract(environment, CONTRACT_NAMES.WRAPPER_LOCK_ETH, [
  //     'WETH',
  //     'WETH Token',
  //     18,
  //     ethfinex.options.address,
  //     erc20ProxyAddress,
  //   ]),
  // );

  // mlnTokenWrapperInfo = await getToken(
  //   environment,
  //   await deployContract(environment, CONTRACT_NAMES.WRAPPER_LOCK, [
  //     mln.options.address,
  //     'MLN',
  //     'Melon',
  //     18,
  //     false,
  //     ethfinex.options.address,
  //     erc20ProxyAddress,
  //   ]),
  // );

  // await wrapperRegistry.methods
  //   .addNewWrapperPair(
  //     [weth.options.address, mln.options.address],
  //     [contracts.address, mlnTokenWrapperInfo.address],
  //   )
  //   .send(defaultTxOpts);

  // await registry.methods
  //   .setEthfinexWrapperRegistry(wrapperRegistry.options.address)
  //   .send(defaultTxOpts);
});

const initialTokenAmount = toWei('10', 'Ether');
test('investor gets initial ethToken for testing)', async () => {
  const pre = await getAllBalances(contracts, accounts, fund);

  await weth.methods
    .transfer(investor, initialTokenAmount)
    .send(defaultTxOpts);

  const post = await getAllBalances(contracts, accounts, fund);
  const bnInitialTokenAmount = new BN(initialTokenAmount);

  expect(post.investor.weth).toEqualBN(pre.investor.weth.add(bnInitialTokenAmount));
});

// tslint:disable-next-line:max-line-length
test('fund receives ETH from investment, and gets ZRX from direct transfer', async () => {
  const offeredValue = toWei('1', 'ether');
  const wantedShares = toWei('1', 'ether');
  const pre = await getAllBalances(contracts, accounts, fund);

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
  await zrx.methods
    .transfer(fund.vault.options.address, initialTokenAmount)
    .send(defaultTxOpts);

  const post = await getAllBalances(contracts, accounts, fund);
  const bnOfferedValue = new BN(offeredValue);

  expect(post.investor.weth).toEqualBN(pre.investor.weth.sub(bnOfferedValue));
  expect(post.fund.weth).toEqualBN(pre.fund.weth.add(bnOfferedValue));
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
        NULL_ADDRESS,
        mln.options.address,
        weth.options.address,
        order.feeRecipientAddress,
        NULL_ADDRESS,
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
      randomHexOfSize(20),
      order.makerAssetData,
      order.takerAssetData,
      signedOrder.signature,
    )
    .send(managerTxOpts);
  console.log('post2')

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

  const result = await fillOrder(environment, ethfinex.options.address, {
    signedOrder: signedOrder,
  });

  const post = await getAllBalances(contracts, accounts, fund);
  const postDeployerWrappedMLN = new BN(
    await mlnWrapper.methods.balanceOf(deployer).call(),
  );

  const bnMakerAssetAmount = new BN(signedOrder.makerAssetAmount);
  const bnTakerAssetAmount = new BN(signedOrder.takerAssetAmount);

  expect(result).toBeTruthy();
  expect(post.fund.mln).toEqualBN(pre.fund.mln.sub(bnMakerAssetAmount));
  expect(post.fund.weth).toEqualBN(pre.fund.weth.add(bnTakerAssetAmount));
  expect(postDeployerWrappedMLN).toEqualBN(
    preDeployerWrappedMLN.add(bnMakerAssetAmount),
  );
  expect(post.deployer.weth).toEqualBN(pre.deployer.weth.sub(bnTakerAssetAmount));
});

// TODO: fix problem with ecSignOrderAsync error for this to pass
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
    environment,
    zeroExExchange.options.address,
    {
      feeRecipientAddress: investor,
      makerAddress,
      makerTokenAddress: ethTokenWrapperInfo.address,
      makerAssetAmount,
      takerTokenAddress: dgx.options.address,
      takerAssetAmount,
    },
  );
  signedOrder = await signZeroExOrder(environment, unsignedOrder, manager);
  await fund.trading.methods
    .callOnExchange(
      0,
      makeOrderSignature,
      [
        makerAddress,
        NULL_ADDRESS,
        weth.options.address,
        dgx.options.address,
        signedOrder.feeRecipientAddress,
        NULL_ADDRESS,
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
      randomHexOfSize(20),
      signedOrder.makerAssetData,
      signedOrder.takerAssetData,
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
  expect(post.fund.weth).toEqualBN(pre.fund.weth);
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
        NULL_ADDRESS,
        NULL_ADDRESS,
        NULL_ADDRESS,
        NULL_ADDRESS,
        NULL_ADDRESS,
        NULL_ADDRESS,
      ],
      [0, 0, 0, 0, 0, 0, 0, 0],
      orderHashHex,
      '0x0',
      '0x0',
      '0x0',
    )
    .send(managerTxOpts);
  const isOrderCancelled = await zeroExExchange.methods
    .cancelled(orderHashHex)
    .call();

  expect(isOrderCancelled).toBeTruthy();

  const preWithdraw = await getAllBalances(contracts, accounts, fund);
  const preWithdrawCalculations = await fund.accounting.methods
    .performCalculations()
    .call();

  // Withdraw WETH
  await increaseTime(environment, 25 * 60 * 60);
  await fund.trading.methods
    .callOnExchange(
      0,
      withdrawTokensSignature,
      [
        weth.options.address,
        NULL_ADDRESS,
        NULL_ADDRESS,
        NULL_ADDRESS,
        NULL_ADDRESS,
        NULL_ADDRESS,
      ],
      [0, 0, 0, 0, 0, 0, 0, 0],
      '0x0',
      '0x0',
      '0x0',
      '0x0',
    )
    .send(managerTxOpts);
  // To Clean up asset list
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

  expect(post.fund.weth).toEqualBN(preWithdraw.fund.weth);
  expect(preWithdraw.fund.weth).toEqualBN(pre.fund.weth);
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
