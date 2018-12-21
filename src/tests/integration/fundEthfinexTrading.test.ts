import {
  createOrder,
  signOrder,
  approveOrder,
  isValidSignatureOffChain,
} from '~/contracts/exchanges/third-party/0x/utils/createOrder';
import { fillOrder } from '~/contracts/exchanges/third-party/0x';
import {
  orderHashUtils,
  signatureUtils,
  assetDataUtils,
  Order,
} from '@0x/order-utils';
import { createQuantity } from '@melonproject/token-math/quantity';
import { getAssetProxy } from '~/contracts/exchanges/third-party/0x/calls/getAssetProxy';
import { BigInteger, add, subtract } from '@melonproject/token-math/bigInteger';
import { updateTestingPriceFeed } from '../utils/updateTestingPriceFeed';
import { getAllBalances } from '../utils/getAllBalances';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployAndGetSystem } from '~/utils/deployAndGetSystem';
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
import { increaseTime } from '~/utils/evm/increaseTime';
import { deployContract } from '~/utils/solidity/deployContract';
import { getContract } from '~/utils/solidity/getContract';
import { BigNumber } from 'bignumber.js';
import { makeOrderSignature } from '~/utils/constants/orderSignatures';
import { registerExchange } from '~/contracts/version/transactions/registerExchange';
import { FunctionSignatures } from '~/contracts/fund/trading/utils/FunctionSignatures';

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
  s.exchanges = [s.matchingMarket]; // , matchingMarket2];
  s.gas = 8000000;
  s.opts = { from: s.deployer, gas: s.gas };
  s.numberofExchanges = 1;
  s.exchanges = [s.matchingMarket];
  s.erc20ProxyAddress = (await getAssetProxy(
    s.environment,
    s.zeroExExchange.options.address,
  )).toString();
  s.mlnTokenInterface = await getToken(s.environment, s.mln.options.address);
  s.wethTokenInterface = await getToken(s.environment, s.weth.options.address);

  const ethfinexAdapterAddress = await deployContract(
    s.environment,
    Contracts.EthfinexAdapter,
    [],
  );
  await registerExchange(s.environment, contracts.registry.options.address, {
    adapter: ethfinexAdapterAddress,
    exchange: s.zeroExExchange.options.address,
    sigs: [FunctionSignatures.makeOrder, FunctionSignatures.cancelOrder],
    takesCustody: true,
  });
  const exchangeConfigs = {
    [Exchanges.ZeroEx]: {
      adapter: ethfinexAdapterAddress,
      exchange: s.zeroExExchange.options.address,
      takesCustody: false,
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
    [
      'WETH',
      'WETH Token',
      18,
      s.zeroExExchange.options.address,
      s.erc20ProxyAddress,
    ],
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
      s.zeroExExchange.options.address,
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
      s.zeroExExchange.options.address,
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
  const order: Order = {
    exchangeAddress: s.zeroExExchange.options.address.toLowerCase(),
    makerAddress,
    takerAddress: NULL_ADDRESS,
    senderAddress: NULL_ADDRESS,
    feeRecipientAddress: NULL_ADDRESS,
    expirationTimeSeconds: new BigNumber(9999999999999),
    salt: '5555',
    makerAssetAmount: new BigNumber(10000),
    takerAssetAmount: new BigNumber(10000),
    makerAssetData: assetDataUtils.encodeERC20AssetData(
      s.mlnTokenWrapper.toString(),
    ),
    takerAssetData: assetDataUtils.encodeERC20AssetData(
      s.weth.options.address.toLowerCase(),
    ),
    makerFee: new BigNumber(0),
    takerFee: new BigNumber(0),
  };
  const orderHashHex = orderHashUtils.getOrderHashHex(order);
  let orderSignature = await signatureUtils.ecSignHashAsync(
    s.environment.eth.currentProvider,
    orderHashHex,
    s.manager,
  );
  orderSignature = orderSignature.substring(0, orderSignature.length - 1) + '6';
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
        order.salt,
        0,
        0,
      ],
      randomHexOfSize(20),
      order.makerAssetData,
      order.takerAssetData,
      orderSignature,
    )
    .send({ from: s.manager, gas: s.gas });
  const isValidSignatureBeforeMake = await s.zeroExExchange.methods
    .isValidSignature(
      orderHashHex,
      s.fund.trading.options.address,
      orderSignature,
    )
    .call();
  expect(isValidSignatureBeforeMake).toBeTruthy();
});
