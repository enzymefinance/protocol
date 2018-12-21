import {
  createOrder,
  signOrder,
  approveOrder,
  isValidSignatureOffChain,
} from '~/contracts/exchanges/third-party/0x/utils/createOrder';
import { fillOrder } from '~/contracts/exchanges/third-party/0x';
import { orderHashUtils } from '@0x/order-utils';
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
// import { deployPolicyManagerFactory } from '~/contracts/fund/policies/transactions/deployPolicyManagerFactory';

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
  const exchangeConfigs = {
    [Exchanges.ZeroEx]: {
      adapter: s.zeroExAdapter.options.address,
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

  const ethTokenWrapper = await deployContract(
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

  const mlnTokenWrapper = await deployContract(
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

  const eurTokenWrapper = await deployContract(
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
        ethTokenWrapper.toString(),
        mlnTokenWrapper.toString(),
        eurTokenWrapper.toString(),
      ],
    )
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

// test.serial('Make order through the fund', async t => {
//   const makerAddress = fund.trading.options.address.toLowerCase();
//   order = {
//     exchangeAddress: ethfinexExchange.options.address.toLowerCase(),
//     makerAddress,
//     takerAddress: NULL_ADDRESS,
//     senderAddress: NULL_ADDRESS,
//     feeRecipientAddress: NULL_ADDRESS,
//     expirationTimeSeconds: new BigNumber(await getChainTime()).add(20000),
//     salt: new BigNumber(555),
//     makerAssetAmount: new BigNumber(trade1.sellQuantity),
//     takerAssetAmount: new BigNumber(trade1.buyQuantity),
//     makerAssetData: assetDataUtils.encodeERC20AssetData(
//       mlnTokenWrapper.options.address.toLowerCase(),
//     ),
//     takerAssetData: assetDataUtils.encodeERC20AssetData(
//       ethToken.options.address.toLowerCase(),
//     ),
//     makerFee: new BigNumber(0),
//     takerFee: new BigNumber(0),
//   };
//   const orderHashHex = orderHashUtils.getOrderHashHex(order);
//   orderSignature = await signatureUtils.ecSignHashAsync(
//     web3.currentProvider,
//     orderHashHex,
//     manager,
//   );
//   orderSignature = orderSignature.substring(0, orderSignature.length - 1) + '6';
//   const preGav = await fund.accounting.methods.calcGav().call();
//   const isValidSignatureBeforeMake = await ethfinexExchange.methods
//     .isValidSignature(
//       orderHashHex,
//       fund.trading.options.address,
//       orderSignature,
//     )
//     .call();
//   await fund.trading.methods
//     .callOnExchange(
//       0,
//       makeOrderSignature,
//       [
//         makerAddress,
//         NULL_ADDRESS,
//         mlnToken.options.address,
//         ethToken.options.address,
//         order.feeRecipientAddress,
//         NULL_ADDRESS,
//       ],
//       [
//         order.makerAssetAmount.toFixed(),
//         order.takerAssetAmount.toFixed(),
//         order.makerFee.toFixed(),
//         order.takerFee.toFixed(),
//         order.expirationTimeSeconds.toFixed(),
//         order.salt.toFixed(),
//         0,
//         0,
//       ],
//       web3.utils.padLeft('0x0', 64),
//       order.makerAssetData,
//       order.takerAssetData,
//       orderSignature,
//     )
//     .send({ from: manager, gas: config.gas });
//   const postGav = await fund.accounting.methods.calcGav().call();
//   const isValidSignatureAfterMake = await ethfinexExchange.methods
//     .isValidSignature(
//       orderHashHex,
//       fund.trading.options.address,
//       orderSignature,
//     )
//     .call();
//   t.false(isValidSignatureBeforeMake);
//   t.true(isValidSignatureAfterMake);
//   t.is(preGav, postGav);
// });

// test.serial('Fund can cancel the order using just the orderId', async t => {
//   // await web3.evm.increaseTime(30000);
//   const preGav = await fund.accounting.methods.calcGav().call();
//   const orderHashHex = orderHashUtils.getOrderHashHex(order);
//   await fund.trading.methods
//     .callOnExchange(
//       0,
//       cancelOrderSignature,
//       [
//         NULL_ADDRESS,
//         NULL_ADDRESS,
//         NULL_ADDRESS,
//         NULL_ADDRESS,
//         NULL_ADDRESS,
//         NULL_ADDRESS,
//       ],
//       [0, 0, 0, 0, 0, 0, 0, 0],
//       orderHashHex,
//       '0x0',
//       '0x0',
//       '0x0',
//     )
//     .send({ from: manager, gas: config.gas });
//   const postGav = await fund.accounting.methods.calcGav().call();
//   const isOrderCancelled = await ethfinexExchange.methods
//     .cancelled(orderHashHex)
//     .call();
//   const makerAssetAllowance = new BigNumber(
//     await mlnToken.methods
//       .allowance(fund.trading.options.address, erc20Proxy.options.address)
//       .call(),
//   );
//   t.true(isOrderCancelled);
//   t.is(preGav, postGav);
//   t.deepEqual(makerAssetAllowance, new BigNumber(0));
// });

// test.serial('Make order through the fund with native asset', async t => {
//   const makerAddress = fund.trading.options.address.toLowerCase();
//   const [, referencePrice] = Object.values(
//     await pricefeed.methods
//       .getReferencePriceInfo(ethToken.options.address, mlnToken.options.address)
//       .call(),
//   );
//   const sellQuantity1 = new BigNumber(10 ** 18);
//   const trade2 = {
//     sellQuantity: sellQuantity1,
//     buyQuantity: new BigNumber(referencePrice)
//       .dividedBy(new BigNumber(10 ** 18))
//       .times(sellQuantity1),
//   };
//   order = {
//     exchangeAddress: ethfinexExchange.options.address.toLowerCase(),
//     makerAddress,
//     takerAddress: NULL_ADDRESS,
//     senderAddress: NULL_ADDRESS,
//     feeRecipientAddress: NULL_ADDRESS,
//     expirationTimeSeconds: new BigNumber(await getChainTime()).add(20000),
//     salt: new BigNumber(555),
//     makerAssetAmount: new BigNumber(trade2.sellQuantity),
//     takerAssetAmount: new BigNumber(trade2.buyQuantity),
//     makerAssetData: assetDataUtils.encodeERC20AssetData(
//       ethTokenWrapper.options.address.toLowerCase(),
//     ),
//     takerAssetData: assetDataUtils.encodeERC20AssetData(
//       mlnToken.options.address.toLowerCase(),
//     ),
//     makerFee: new BigNumber(0),
//     takerFee: new BigNumber(0),
//   };
//   const orderHashHex = orderHashUtils.getOrderHashHex(order);
//   orderSignature = await signatureUtils.ecSignHashAsync(
//     web3.currentProvider,
//     orderHashHex,
//     manager,
//   );
//   orderSignature = orderSignature.substring(0, orderSignature.length - 1) + '6';
//   const preGav = await fund.accounting.methods.calcGav().call();
//   const isValidSignatureBeforeMake = await ethfinexExchange.methods
//     .isValidSignature(
//       orderHashHex,
//       fund.trading.options.address,
//       orderSignature,
//     )
//     .call();
//   await fund.trading.methods
//     .callOnExchange(
//       0,
//       makeOrderSignature,
//       [
//         makerAddress,
//         NULL_ADDRESS,
//         ethToken.options.address,
//         mlnToken.options.address,
//         order.feeRecipientAddress,
//         NULL_ADDRESS,
//       ],
//       [
//         order.makerAssetAmount.toFixed(),
//         order.takerAssetAmount.toFixed(),
//         order.makerFee.toFixed(),
//         order.takerFee.toFixed(),
//         order.expirationTimeSeconds.toFixed(),
//         order.salt.toFixed(),
//         0,
//         0,
//       ],
//       web3.utils.padLeft('0x0', 64),
//       order.makerAssetData,
//       order.takerAssetData,
//       orderSignature,
//     )
//     .send({ from: manager, gas: config.gas });
//   const postGav = await fund.accounting.methods.calcGav().call();
//   const ethTokenWrapperBalance = new BigNumber(
//     await ethTokenWrapper.methods
//       .balanceOf(fund.trading.options.address)
//       .call(),
//   );
//   const isValidSignatureAfterMake = await ethfinexExchange.methods
//     .isValidSignature(
//       orderHashHex,
//       fund.trading.options.address,
//       orderSignature,
//     )
//     .call();
//   t.false(isValidSignatureBeforeMake);
//   t.true(isValidSignatureAfterMake);
//   t.deepEqual(ethTokenWrapperBalance, order.makerAssetAmount);
//   t.is(preGav, postGav);
// });

// test.serial('Withdraw (unwrap) tokens after lock time has passed', async t => {
//   await web3.evm.increaseTime(30000);
//   const preGav = await fund.accounting.methods.calcGav().call();
//   await fund.trading.methods
//     .callOnExchange(
//       0,
//       withdrawTokensSignature,
//       [
//         ethToken.options.address,
//         mlnToken.options.address,
//         NULL_ADDRESS,
//         NULL_ADDRESS,
//         NULL_ADDRESS,
//         NULL_ADDRESS,
//       ],
//       [0, 0, 0, 0, 0, 0, 0, 0],
//       web3.utils.padLeft('0x0', 64),
//       '0x0',
//       '0x0',
//       '0x0',
//     )
//     .send({ from: manager, gas: config.gas });
//   const postGav = await fund.accounting.methods.calcGav().call();
//   const ethTokenWrapperBalance = Number(
//     await ethTokenWrapper.methods
//       .balanceOf(fund.trading.options.address)
//       .call(),
//   );
//   const mlnTokenWrapperBalance = Number(
//     await mlnTokenWrapper.methods
//       .balanceOf(fund.trading.options.address)
//       .call(),
//   );
//   t.is(ethTokenWrapperBalance, 0);
//   t.is(mlnTokenWrapperBalance, 0);
//   t.is(preGav, postGav);
// });
