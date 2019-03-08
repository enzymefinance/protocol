import { signOrder } from '~/contracts/exchanges/third-party/0x/utils/signOrder';
import { orderHashUtils } from '@0x/order-utils';
import { getAssetProxy } from '~/contracts/exchanges/third-party/0x/calls/getAssetProxy';
import {
  BigInteger,
  add,
  subtract,
  toBI,
  createQuantity,
} from '@melonproject/token-math';
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
import { BigNumber } from 'bignumber.js';
import {
  makeOrderSignature,
  cancelOrderSignature,
  withdrawTokensSignature,
} from '~/utils/constants/orderSignatures';
import { fillOrder } from '~/contracts/exchanges/third-party/0x/transactions/fillOrder';
import { createOrder } from '~/contracts/exchanges/third-party/0x/utils/createOrder';
import { increaseTime } from '~/utils/evm';

// mock data
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

let s: any = {};

beforeAll(async () => {
  s.environment = await initTestEnvironment();
  s.accounts = await s.environment.eth.getAccounts();
  const { addresses, contracts } = await deployAndGetSystem(s.environment);
  s.addresses = addresses;
  s = Object.assign(s, contracts);

  [s.deployer, s.manager, s.investor] = s.accounts;
  s.gas = 8000000;
  s.opts = { from: s.deployer, gas: s.gas };
  s.erc20ProxyAddress = (await getAssetProxy(
    s.environment,
    s.ethfinex.options.address,
  )).toString();
  s.mlnTokenInterface = await getToken(s.environment, s.mln.options.address);
  s.wethTokenInterface = await getToken(s.environment, s.weth.options.address);
  s.dgxTokenInterface = await getToken(s.environment, s.dgx.options.address);
  const exchangeConfigs = {
    [Exchanges.Ethfinex]: {
      adapter: s.ethfinexAdapter.options.address,
      exchange: s.ethfinex.options.address,
      takesCustody: true,
    },
  };
  const envManager = withDifferentAccount(s.environment, s.manager);
  await beginSetup(envManager, s.version.options.address, {
    defaultTokens: [s.wethTokenInterface, s.mlnTokenInterface],
    exchangeConfigs,
    fees: [],
    fundName: 'Test fund',
    quoteToken: s.wethTokenInterface,
  });
  await createAccounting(envManager, s.version.options.address);
  await createFeeManager(envManager, s.version.options.address);
  await createParticipation(envManager, s.version.options.address);
  await createPolicyManager(envManager, s.version.options.address);
  await createShares(envManager, s.version.options.address);
  await createTrading(envManager, s.version.options.address);
  await createVault(envManager, s.version.options.address);
  const hubAddress = await completeSetup(envManager, s.version.options.address);
  s.fund = await getFundComponents(envManager, hubAddress);
  await updateTestingPriceFeed(s, s.environment);

  const wrapperRegistryAddress = await deployContract(
    s.environment,
    Contracts.WrapperRegistryEFX,
    [],
  );

  const wrapperRegistry = await getContract(
    s.environment,
    Contracts.WrapperRegistryEFX,
    wrapperRegistryAddress,
  );

  s.ethTokenWrapper = await getToken(
    s.environment,
    await deployContract(s.environment, Contracts.WrapperLockEth, [
      'WETH',
      'WETH Token',
      18,
      s.ethfinex.options.address,
      s.erc20ProxyAddress,
    ]),
  );

  s.mlnTokenWrapper = await getToken(
    s.environment,
    await deployContract(s.environment, Contracts.WrapperLock, [
      s.mln.options.address,
      'MLN',
      'Melon',
      18,
      false,
      s.ethfinex.options.address,
      s.erc20ProxyAddress,
    ]),
  );

  await wrapperRegistry.methods
    .addNewWrapperPair(
      [s.weth.options.address, s.mln.options.address],
      [s.ethTokenWrapper.address, s.mlnTokenWrapper.address],
    )
    .send({ from: s.deployer, gas: s.gas });

  await s.registry.methods
    .setEthfinexWrapperRegistry(wrapperRegistry.options.address)
    .send({ from: s.deployer, gas: s.gas });
});

const initialTokenAmount = new BigInteger(10 ** 19);
test('investor gets initial ethToken for testing)', async () => {
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  await s.weth.methods
    .transfer(s.investor, `${initialTokenAmount}`)
    .send(s.opts);
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);

  expect(post.investor.weth).toEqual(
    add(pre.investor.weth, initialTokenAmount),
  );
});

// tslint:disable-next-line:max-line-length
test('fund receives ETH from investment, and gets ZRX from direct transfer', async () => {
  const offeredValue = new BigInteger(10 ** 18);
  const wantedShares = new BigInteger(10 ** 18);
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  await s.weth.methods
    .approve(s.fund.participation.options.address, `${offeredValue}`)
    .send({ from: s.investor, gas: s.gas });
  await s.fund.participation.methods
    .requestInvestment(
      `${offeredValue}`,
      `${wantedShares}`,
      s.weth.options.address,
    )
    .send({ from: s.investor, gas: s.gas, value: '10000000000000000' });
  await s.fund.participation.methods
    .executeRequestFor(s.investor)
    .send({ from: s.investor, gas: s.gas });
  await s.zrx.methods
    .transfer(s.fund.vault.options.address, `${initialTokenAmount}`)
    .send({ from: s.deployer, gas: s.gas });
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);

  expect(post.investor.weth).toEqual(subtract(pre.investor.weth, offeredValue));
  expect(post.fund.weth).toEqual(add(pre.fund.weth, offeredValue));
});

test('Make order through the fund', async () => {
  await s.mln.methods
    .transfer(s.fund.vault.options.address, new BigNumber(10 ** 18).toFixed())
    .send({ from: s.deployer, gas: s.gas });
  const makerAddress = s.fund.trading.options.address.toLowerCase();
  const makerQuantity = createQuantity(s.mlnTokenWrapper, 1);
  const takerQuantity = createQuantity(s.wethTokenInterface, 0.1);
  const order = await createOrder(s.environment, s.ethfinex.options.address, {
    makerAddress,
    makerQuantity,
    takerQuantity,
  });

  const orderHashHex = orderHashUtils.getOrderHashHex(order);
  s.signedOrder = await signOrder(s.environment, order, s.manager);
  const preCalculations = await s.fund.accounting.methods
    .performCalculations()
    .call();
  await s.fund.trading.methods
    .callOnExchange(
      0,
      makeOrderSignature,
      [
        makerAddress,
        NULL_ADDRESS,
        s.mln.options.address,
        s.weth.options.address,
        order.feeRecipientAddress,
        NULL_ADDRESS,
      ],
      [
        order.makerAssetAmount.toFixed(),
        order.takerAssetAmount.toFixed(),
        order.makerFee.toFixed(),
        order.takerFee.toFixed(),
        order.expirationTimeSeconds.toFixed(),
        order.salt.toFixed(),
        0,
        0,
      ],
      randomHexOfSize(20),
      order.makerAssetData,
      order.takerAssetData,
      s.signedOrder.signature,
    )
    .send({ from: s.manager, gas: s.gas });
  const postCalculations = await s.fund.accounting.methods
    .performCalculations()
    .call();
  const isValidSignatureBeforeMake = await s.ethfinex.methods
    .isValidSignature(
      orderHashHex,
      s.fund.trading.options.address,
      s.signedOrder.signature,
    )
    .call();
  expect(isValidSignatureBeforeMake).toBeTruthy();
  expect(postCalculations.gav).toBe(preCalculations.gav);
  expect(postCalculations.sharePrice).toBe(preCalculations.sharePrice);
});

test('Third party takes the order made by the fund', async () => {
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const mlnWrapperContract = await getContract(
    s.environment,
    Contracts.WrapperLock,
    s.mlnTokenWrapper.address,
  );
  const preDeployerWrappedMLN = new BigInteger(
    await mlnWrapperContract.methods.balanceOf(s.deployer).call(),
  );
  const result = await fillOrder(s.environment, s.ethfinex.options.address, {
    signedOrder: s.signedOrder,
  });

  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const postDeployerWrappedMLN = new BigInteger(
    await mlnWrapperContract.methods.balanceOf(s.deployer).call(),
  );

  expect(result).toBeTruthy();
  expect(post.fund.mln).toEqual(
    subtract(pre.fund.mln, toBI(s.signedOrder.makerAssetAmount)),
  );
  expect(post.fund.weth).toEqual(
    add(pre.fund.weth, toBI(s.signedOrder.takerAssetAmount)),
  );
  expect(postDeployerWrappedMLN).toEqual(
    add(preDeployerWrappedMLN, toBI(s.signedOrder.makerAssetAmount)),
  );
  expect(post.deployer.weth).toEqual(
    subtract(pre.deployer.weth, toBI(s.signedOrder.takerAssetAmount)),
  );
});

// tslint:disable-next-line:max-line-length
test('Make order with native asset', async () => {
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const preCalculations = await s.fund.accounting.methods
    .performCalculations()
    .call();
  const preIsDgxInAssetList = await s.fund.accounting.methods
    .isInAssetList(s.dgx.options.address)
    .call();

  const makerAddress = s.fund.trading.options.address.toLowerCase();
  const makerQuantity = createQuantity(s.ethTokenWrapper, 0.05);
  const takerQuantity = createQuantity(s.dgxTokenInterface, 0.5);
  s.unsignedOrder = await createOrder(
    s.environment,
    s.zeroExExchange.options.address,
    {
      feeRecipientAddress: s.investor,
      makerAddress,
      makerQuantity,
      takerQuantity,
    },
  );
  s.signedOrder = await signOrder(s.environment, s.unsignedOrder, s.manager);
  await s.fund.trading.methods
    .callOnExchange(
      0,
      makeOrderSignature,
      [
        makerAddress,
        NULL_ADDRESS,
        s.weth.options.address,
        s.dgx.options.address,
        s.signedOrder.feeRecipientAddress,
        NULL_ADDRESS,
      ],
      [
        s.signedOrder.makerAssetAmount.toFixed(),
        s.signedOrder.takerAssetAmount.toFixed(),
        s.signedOrder.makerFee.toFixed(),
        s.signedOrder.takerFee.toFixed(),
        s.signedOrder.expirationTimeSeconds.toFixed(),
        s.signedOrder.salt.toFixed(),
        0,
        0,
      ],
      randomHexOfSize(20),
      s.signedOrder.makerAssetData,
      s.signedOrder.takerAssetData,
      s.signedOrder.signature,
    )
    .send({ from: s.manager, gas: s.gas });
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const postCalculations = await s.fund.accounting.methods
    .performCalculations()
    .call();
  const postIsDgxInAssetList = await s.fund.accounting.methods
    .isInAssetList(s.dgx.options.address)
    .call();
  const openOrdersAgainstDgx = await s.fund.trading.methods
    .openMakeOrdersAgainstAsset(s.dgx.options.address)
    .call();

  expect(postCalculations.gav).toBe(preCalculations.gav);
  expect(postCalculations.sharePrice).toBe(preCalculations.sharePrice);
  expect(post.fund.weth).toEqual(pre.fund.weth);
  expect(postIsDgxInAssetList).toBeTruthy();
  expect(preIsDgxInAssetList).toBeFalsy();
  expect(Number(openOrdersAgainstDgx)).toEqual(1);
});

test('Anticipated taker asset is not removed from owned assets', async () => {
  await s.fund.accounting.methods
    .performCalculations()
    .send({ from: s.manager, gas: s.gas });
  await s.fund.accounting.methods
    .updateOwnedAssets()
    .send({ from: s.manager, gas: s.gas });

  const isDgxInAssetList = await s.fund.accounting.methods
    .isInAssetList(s.dgx.options.address)
    .call();

  expect(isDgxInAssetList).toBeTruthy();
});

test('Cancel the order and withdraw tokens', async () => {
  const orderHashHex = orderHashUtils.getOrderHashHex(s.signedOrder);
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const preCalculations = await s.fund.accounting.methods
    .performCalculations()
    .call();
  await s.fund.trading.methods
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
    .send({ from: s.manager, gas: s.gas });
  const isOrderCancelled = await s.zeroExExchange.methods
    .cancelled(orderHashHex)
    .call();

  expect(isOrderCancelled).toBeTruthy();

  const preWithdraw = await getAllBalances(
    s,
    s.accounts,
    s.fund,
    s.environment,
  );
  const preWithdrawCalculations = await s.fund.accounting.methods
    .performCalculations()
    .call();

  // Withdraw WETH
  await increaseTime(s.environment, 25 * 60 * 60);
  await s.fund.trading.methods
    .callOnExchange(
      0,
      withdrawTokensSignature,
      [
        s.weth.options.address,
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
    .send({ from: s.manager, gas: s.gas });
  // To Clean up asset list
  await s.fund.accounting.methods
    .performCalculations()
    .send({ from: s.manager, gas: s.gas });
  await s.fund.accounting.methods
    .updateOwnedAssets()
    .send({ from: s.manager, gas: s.gas });

  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const postCalculations = await s.fund.accounting.methods
    .performCalculations()
    .call();
  const isDgxInAssetList = await s.fund.accounting.methods
    .isInAssetList(s.dgx.options.address)
    .call();
  const openOrdersAgainstDgx = await s.fund.trading.methods
    .openMakeOrdersAgainstAsset(s.dgx.options.address)
    .call();

  expect(post.fund.weth).toEqual(preWithdraw.fund.weth);
  expect(preWithdraw.fund.weth).toEqual(pre.fund.weth);
  expect(postCalculations.gav).toEqual(preWithdrawCalculations.gav);
  expect(preWithdrawCalculations.gav).toEqual(preCalculations.gav);
  expect(postCalculations.sharePrice).toEqual(
    preWithdrawCalculations.sharePrice,
  );
  expect(preWithdrawCalculations.sharePrice).toEqual(
    preCalculations.sharePrice,
  );
  expect(isDgxInAssetList).toBeFalsy();
  expect(Number(openOrdersAgainstDgx)).toEqual(0);
});
