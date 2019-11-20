import { signOrder } from '~/contracts/exchanges/third-party/0x/utils/signOrder';
import { orderHashUtils } from '@0x/order-utils';
import { getAssetProxy } from '~/contracts/exchanges/third-party/0x/calls/getAssetProxy';
import { updateTestingPriceFeed } from '../utils/updateTestingPriceFeed';
import { getAllBalances } from '../utils/getAllBalances';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployAndGetSystem } from '~/tests/utils/deployAndGetSystem';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { beginSetup } from '~/contracts/factory/transactions/beginSetup';
import { completeSetup } from '~/contracts/factory/transactions/completeSetup';
import { createAccounting } from '~/contracts/factory/transactions/createAccounting';
import { createFeeManager } from '~/contracts/factory/transactions/createFeeManager';
import { createParticipation } from '~/contracts/factory/transactions/createParticipation';
import { createPolicyManager } from '~/contracts/factory/transactions/createPolicyManager';
import { createShares } from '~/contracts/factory/transactions/createShares';
import { createTrading } from '~/contracts/factory/transactions/createTrading';
import { createVault } from '~/contracts/factory/transactions/createVault';
import { getFundComponents } from '~/utils/getFundComponents';
import { randomHexOfSize } from '~/utils/helpers/randomHexOfSize';
import { Exchanges, Contracts } from '~/Contracts';
import { withDifferentAccount } from '~/utils/environment/withDifferentAccount';
import { deployContract } from '~/utils/solidity/deployContract';
import { getContract } from '~/utils/solidity/getContract';
import {
  makeOrderSignature,
  cancelOrderSignature,
  withdrawTokensSignature,
} from '~/utils/constants/orderSignatures';
import { fillOrder } from '~/contracts/exchanges/third-party/0x/transactions/fillOrder';
import { createUnsignedOrder } from '~/contracts/exchanges/third-party/0x/utils/createOrder';
import { increaseTime } from '~/utils/evm';
import { BN, toWei } from 'web3-utils';

// mock data
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

let environment, accounts;
let deployer, manager, investor;
let defaultTxOpts, investorTxOpts, managerTxOpts;
let mlnTokenInfo, wethTokenInfo, dgxTokenInfo;
let mlnTokenWrapperInfo, ethTokenWrapperInfo;
let unsignedOrder, signedOrder;
let contracts;
let fund;

beforeAll(async () => {
  environment = await initTestEnvironment();
  accounts = await environment.eth.getAccounts();
  [deployer, manager, investor] = accounts;

  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  const system = await deployAndGetSystem(environment);
  contracts = system.contracts;

  const {
    ethfinex,
    ethfinexAdapter,
    mln,
    weth,
    dgx,
    version,
    version: fundFactory,
    registry,
  } = contracts;

  const erc20ProxyAddress = (await getAssetProxy(
    environment,
    ethfinex.options.address,
  )).toString();

  mlnTokenInfo = await getToken(environment, mln.options.address);
  wethTokenInfo = await getToken(environment, weth.options.address);
  dgxTokenInfo = await getToken(environment, dgx.options.address);

  const exchangeConfigs = {
    [Exchanges.ethfinex]: {
      adapter: ethfinexAdapter.options.address,
      exchange: ethfinex.options.address,
      takesCustody: true,
    },
  };
  const envManager = withDifferentAccount(environment, manager);
  await beginSetup(envManager, version.options.address, {
    defaultTokens: [wethTokenInfo, mlnTokenInfo],
    exchangeConfigs,
    fees: [],
    fundName: 'Test fund',
    quoteToken: wethTokenInfo,
  });

  await fundFactory.methods.createAccounting().send(managerTxOpts);
  await fundFactory.methods.createFeeManager().send(managerTxOpts);
  await fundFactory.methods.createParticipation().send(managerTxOpts);
  await fundFactory.methods.createPolicyManager().send(managerTxOpts);
  await fundFactory.methods.createShares().send(managerTxOpts);
  await fundFactory.methods.createTrading().send(managerTxOpts);
  await fundFactory.methods.createVault().send(managerTxOpts);
  const res = await fundFactory.methods.completeSetup().send(managerTxOpts);
  const hubAddress = res.events.NewFund.returnValues.hub;

  fund = await getFundComponents(envManager, hubAddress);
  await updateTestingPriceFeed(contracts, environment);

  const wrapperRegistryAddress = await deployContract(
    environment,
    Contracts.WrapperRegistryEFX,
    [],
  );

  const wrapperRegistry = await getContract(
    environment,
    Contracts.WrapperRegistryEFX,
    wrapperRegistryAddress,
  );

  ethTokenWrapperInfo = await getToken(
    environment,
    await deployContract(environment, Contracts.WrapperLockEth, [
      'WETH',
      'WETH Token',
      18,
      ethfinex.options.address,
      erc20ProxyAddress,
    ]),
  );

  mlnTokenWrapperInfo = await getToken(
    environment,
    await deployContract(environment, Contracts.WrapperLock, [
      mln.options.address,
      'MLN',
      'Melon',
      18,
      false,
      ethfinex.options.address,
      erc20ProxyAddress,
    ]),
  );

  await wrapperRegistry.methods
    .addNewWrapperPair(
      [weth.options.address, mln.options.address],
      [ethTokenWrapperInfo.address, mlnTokenWrapperInfo.address],
    )
    .send(defaultTxOpts);

  await registry.methods
    .setEthfinexWrapperRegistry(wrapperRegistry.options.address)
    .send(defaultTxOpts);
});

const initialTokenAmount = toWei('10', 'Ether');
test('investor gets initial ethToken for testing)', async () => {
  const { weth } = contracts;
  const pre = await getAllBalances(contracts, accounts, fund, environment);

  await weth.methods
    .transfer(investor, initialTokenAmount)
    .send(defaultTxOpts);

  const post = await getAllBalances(contracts, accounts, fund, environment);
  const bnInitialTokenAmount = new BN(initialTokenAmount);

  expect(post.investor.weth).toEqualBN(pre.investor.weth.add(bnInitialTokenAmount));
});

// tslint:disable-next-line:max-line-length
test('fund receives ETH from investment, and gets ZRX from direct transfer', async () => {
  const { weth, zrx } = contracts;
  const offeredValue = toWei('1', 'ether');
  const wantedShares = toWei('1', 'ether');
  const pre = await getAllBalances(contracts, accounts, fund, environment);

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

  const post = await getAllBalances(contracts, accounts, fund, environment);
  const bnOfferedValue = new BN(offeredValue);

  expect(post.investor.weth).toEqualBN(pre.investor.weth.sub(bnOfferedValue));
  expect(post.fund.weth).toEqualBN(pre.fund.weth.add(bnOfferedValue));
});

test('Make order through the fund', async () => {
  const { ethfinex, mln, weth } = contracts;
  await mln.methods
    .transfer(fund.vault.options.address, toWei('1', 'ether'))
    .send(defaultTxOpts);

  const makerAddress = fund.trading.options.address.toLowerCase();
  const makerAssetAmount = toWei('1', 'ether');
  const takerAssetAmount = toWei('.1', 'ether');

  const order = await createUnsignedOrder(environment, ethfinex.options.address, {
    makerAddress,
    makerTokenAddress: mlnTokenWrapperInfo.address,
    makerAssetAmount,
    takerTokenAddress: wethTokenInfo.address,
    takerAssetAmount,
  });

  const orderHashHex = orderHashUtils.getOrderHashHex(order);
  const preCalculations = await fund.accounting.methods
    .performCalculations()
    .call();
  signedOrder = await signOrder(environment, order, manager);

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
  const { ethfinex } = contracts;
  const pre = await getAllBalances(contracts, accounts, fund, environment);
  const mlnWrapperContract = await getContract(
    environment,
    Contracts.WrapperLock,
    mlnTokenWrapperInfo.address,
  );
  const preDeployerWrappedMLN = new BN(
    await mlnWrapperContract.methods.balanceOf(deployer).call(),
  );
  const result = await fillOrder(environment, ethfinex.options.address, {
    signedOrder: signedOrder,
  });

  const post = await getAllBalances(contracts, accounts, fund, environment);
  const postDeployerWrappedMLN = new BN(
    await mlnWrapperContract.methods.balanceOf(deployer).call(),
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

// // tslint:disable-next-line:max-line-length
test('Make order with native asset', async () => {
  const { weth, dgx, zeroExExchange } = contracts;
  const pre = await getAllBalances(contracts, accounts, fund, environment);
  const preCalculations = await fund.accounting.methods
    .performCalculations()
    .call();
  const preIsDgxInAssetList = await fund.accounting.methods
    .isInAssetList(dgx.options.address)
    .call();

  const makerAddress = fund.trading.options.address.toLowerCase();
  const makerAssetAmount = toWei('.05', 'ether');
  const takerAssetAmount = toWei('.5', 'ether');
  unsignedOrder = await createUnsignedOrder(
    environment,
    zeroExExchange.options.address,
    {
      feeRecipientAddress: investor,
      makerAddress,
      makerTokenAddress: ethTokenWrapperInfo.address,
      makerAssetAmount,
      takerTokenAddress: dgxTokenInfo.address,
      takerAssetAmount,
    },
  );
  signedOrder = await signOrder(environment, unsignedOrder, manager);
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
  const post = await getAllBalances(contracts, accounts, fund, environment);
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
  const { dgx } = contracts;
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
  const { weth, dgx, zeroExExchange } = contracts;
  const orderHashHex = orderHashUtils.getOrderHashHex(signedOrder);
  const pre = await getAllBalances(contracts, accounts, fund, environment);
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

  const preWithdraw = await getAllBalances(
    contracts,
    accounts,
    fund,
    environment,
  );
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

  const post = await getAllBalances(contracts, accounts, fund, environment);
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
