import { signOrder } from '~/contracts/exchanges/third-party/0x/utils/createOrder';
import { fillOrder } from '~/contracts/exchanges/third-party/0x';
import { orderHashUtils, assetDataUtils, Order } from '@0x/order-utils';
import { getAssetProxy } from '~/contracts/exchanges/third-party/0x/calls/getAssetProxy';
import { BigInteger, add, subtract } from '@melonproject/token-math/bigInteger';
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
import { makeOrderSignature } from '~/utils/constants/orderSignatures';
import { getLatestBlock } from '~/utils/evm';

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
    nativeToken: s.wethTokenInterface,
    priceSource: s.priceSource.options.address,
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

  s.ethTokenWrapper = await deployContract(
    s.environment,
    Contracts.WrapperLockEth,
    ['WETH', 'WETH Token', 18, s.ethfinex.options.address, s.erc20ProxyAddress],
  );

  s.mlnTokenWrapper = await deployContract(
    s.environment,
    Contracts.WrapperLock,
    [
      s.mln.options.address,
      'MLN',
      'Melon',
      18,
      false,
      s.ethfinex.options.address,
      s.erc20ProxyAddress,
    ],
  );

  s.eurTokenWrapper = await deployContract(
    s.environment,
    Contracts.WrapperLock,
    [
      s.eur.options.address,
      'EUR',
      'Euro Token',
      18,
      false,
      s.ethfinex.options.address,
      s.erc20ProxyAddress,
    ],
  );

  await wrapperRegistry.methods
    .addNewWrapperPair(
      [s.weth.options.address, s.mln.options.address, s.eur.options.address],
      [
        s.ethTokenWrapper.toString(),
        s.mlnTokenWrapper.toString(),
        s.eurTokenWrapper.toString(),
      ],
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
    .send({ from: s.investor, gas: s.gas });
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
  const latestBlock = await getLatestBlock(s.environment);
  const order: Order = {
    exchangeAddress: s.ethfinex.options.address.toLowerCase(),
    expirationTimeSeconds: new BigNumber(latestBlock.timestamp).add(10000),
    feeRecipientAddress: NULL_ADDRESS,
    makerAddress,
    makerAssetAmount: new BigNumber(10 ** 17),
    makerAssetData: assetDataUtils.encodeERC20AssetData(
      s.mlnTokenWrapper.toString(),
    ),
    makerFee: new BigNumber(0),
    salt: new BigNumber(5555),
    senderAddress: NULL_ADDRESS,
    takerAddress: NULL_ADDRESS,
    takerAssetAmount: new BigNumber(10 ** 16),

    takerAssetData: assetDataUtils.encodeERC20AssetData(
      s.weth.options.address.toLowerCase(),
    ),
    takerFee: new BigNumber(0),
  };
  const orderHashHex = orderHashUtils.getOrderHashHex(order);
  s.signedOrder = await signOrder(s.environment, order, s.manager);
  const preGav = await s.fund.accounting.methods.calcGav().call();
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
  const postGav = await s.fund.accounting.methods.calcGav().call();
  const isValidSignatureBeforeMake = await s.ethfinex.methods
    .isValidSignature(
      orderHashHex,
      s.fund.trading.options.address,
      s.signedOrder.signature,
    )
    .call();
  expect(isValidSignatureBeforeMake).toBeTruthy();
  expect(preGav).toBe(postGav);
});

test('Third party takes the order made by the fund', async () => {
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const mlnWrapperContract = await getContract(
    s.environment,
    Contracts.WrapperLock,
    s.mlnTokenWrapper,
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
    subtract(pre.fund.mln, s.signedOrder.makerAssetAmount),
  );
  expect(post.fund.weth).toEqual(
    add(pre.fund.weth, s.signedOrder.takerAssetAmount),
  );
  expect(postDeployerWrappedMLN).toEqual(
    add(preDeployerWrappedMLN, s.signedOrder.makerAssetAmount),
  );
  expect(post.deployer.weth).toEqual(
    subtract(pre.deployer.weth, s.signedOrder.takerAssetAmount),
  );
});
