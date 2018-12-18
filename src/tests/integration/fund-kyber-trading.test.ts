import {
  makeOrderSignature,
  takeOrderSignature,
  cancelOrderSignature,
} from '~/utils/constants/orderSignatures';
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
import {
  BigInteger,
  add,
  subtract,
  multiply,
  divide,
  power,
} from '@melonproject/token-math/bigInteger';
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
import { Exchanges } from '~/Contracts';
import { withDifferentAccount } from '~/utils/environment/withDifferentAccount';
import { deployKyberEnvironment } from '~/contracts/exchanges/transactions/deployKyberEnvironment';
// import { deployPolicyManagerFactory } from '~/contracts/fund/policies/transactions/deployPolicyManagerFactory';

// mock data
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
const precisionUnits = power(new BigInteger(10), new BigInteger(18));
const kyberEthAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

let s: any = {};

beforeAll(async () => {
  s.environment = await initTestEnvironment();
  s.accounts = await s.environment.eth.getAccounts();
  const { addresses, contracts } = await deployAndGetSystem(s.environment);
  s = Object.assign(s, contracts);
  s.addresses = addresses;
  s.mlnTokenInterface = await getToken(s.environment, s.mln.options.address);
  s.wethTokenInterface = await getToken(s.environment, s.weth.options.address);
  s.eurTokenInterface = await getToken(s.environment, s.eur.options.address);
  [s.deployer, s.manager, s.investor] = s.accounts;
  s.exchanges = [s.kyberNetwork]; // , matchingMarket2];
  s.gas = 8000000;
  s.opts = { from: s.deployer, gas: s.gas };
  s.numberofExchanges = 1;
  const exchangeConfigs = {
    [Exchanges.KyberNetwork]: {
      adapter: s.kyberAdapter.options.address,
      exchange: s.kyberNetwork.options.address,
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

  await updateTestingPriceFeed(s, s.environment);
  [, s.mlnPrice] = Object.values(
    await s.priceSource.methods
      .getReferencePriceInfo(s.mln.options.address, s.weth.options.address)
      .call(),
  ).map(e => new BigInteger(e));
});

const initialTokenAmount = power(new BigInteger(10), new BigInteger(19));
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

test('fund receives ETH from investment', async () => {
  const offeredValue = power(new BigInteger(10), new BigInteger(18));
  const wantedShares = power(new BigInteger(10), new BigInteger(18));
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
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);

  expect(post.investor.weth).toEqual(subtract(pre.investor.weth, offeredValue));
  expect(post.fund.weth).toEqual(add(pre.fund.weth, offeredValue));
});

test('swap ethToken for mlnToken with specific order price (minRate)', async () => {
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const srcAmount = power(new BigInteger(10), new BigInteger(17));
  const [bestRate] = Object.values(
    await s.kyberNetwork.methods
      .getExpectedRate(kyberEthAddress, s.mln.options.address, `${srcAmount}`)
      .call(),
  ).map(e => new BigInteger(e));
  const destAmount = divide(
    multiply(new BigInteger(srcAmount), bestRate),
    precisionUnits,
  );
  await s.fund.trading.methods
    .callOnExchange(
      0,
      takeOrderSignature,
      [
        NULL_ADDRESS,
        NULL_ADDRESS,
        s.weth.options.address,
        s.mln.options.address,
        NULL_ADDRESS,
        NULL_ADDRESS,
      ],
      [`${srcAmount}`, `${destAmount}`, 0, 0, 0, 0, `${destAmount}`, 0],
      randomHexOfSize(20),
      '0x0',
      '0x0',
      '0x0',
    )
    .send({ from: s.manager, gas: s.gas });
  const expectedMln = divide(
    multiply(srcAmount, bestRate),
    new BigInteger(10 ** 18),
  );
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  expect(post.fund.weth).toEqual(subtract(pre.fund.weth, srcAmount));
  expect(post.fund.mln).toEqual(add(pre.fund.mln, expectedMln));
});

test('swap mlnToken for ethToken with specific order price (minRate)', async () => {
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const srcAmount = power(new BigInteger(10), new BigInteger(17));
  const [bestRate] = Object.values(
    await s.kyberNetwork.methods
      .findBestRate(s.mln.options.address, kyberEthAddress, `${srcAmount}`)
      .call(),
  ).map(e => new BigInteger(e));
  const destAmount = divide(multiply(srcAmount, bestRate), precisionUnits);
  await s.fund.trading.methods
    .callOnExchange(
      0,
      takeOrderSignature,
      [
        NULL_ADDRESS,
        NULL_ADDRESS,
        s.mln.options.address,
        s.weth.options.address,
        NULL_ADDRESS,
        NULL_ADDRESS,
      ],
      [`${srcAmount}`, `${destAmount}`, 0, 0, 0, 0, `${destAmount}`, 0],
      randomHexOfSize(20),
      '0x0',
      '0x0',
      '0x0',
    )
    .send({ from: s.manager, gas: s.gas });
  const expectedWeth = divide(
    multiply(srcAmount, bestRate),
    new BigInteger(10 ** 18),
  );
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  expect(post.fund.weth).toEqual(subtract(pre.fund.weth, srcAmount));
  expect(post.fund.mln).toEqual(add(pre.fund.mln, expectedWeth));
});

test('swap mlnToken directly to eurToken without minimum destAmount', async () => {
  const fundPreEur = new BigInteger(
    await s.eur.methods.balanceOf(s.fund.vault.options.address).call(),
  );
  const srcAmount = new BigInteger(10 ** 17);
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const [, bestRate] = Object.values(
    await s.kyberNetwork.methods
      .findBestRate(
        s.mln.options.address,
        s.eur.options.address,
        `${srcAmount}`,
      )
      .call(),
  ).map(e => new BigInteger(e));
  const destAmount = divide(multiply(srcAmount, bestRate), precisionUnits);
  await s.fund.trading.methods
    .callOnExchange(
      0,
      takeOrderSignature,
      [
        NULL_ADDRESS,
        NULL_ADDRESS,
        s.mln.options.address,
        s.eur.options.address,
        NULL_ADDRESS,
        NULL_ADDRESS,
      ],
      [srcAmount, destAmount, 0, 0, 0, 0, destAmount, 0],
      randomHexOfSize(20),
      '0x0',
      '0x0',
      '0x0',
    )
    .send({ from: s.manager, gas: s.gas });
  const expectedEurToken = new BigNumber(srcAmount)
    .mul(bestRate)
    .div(new BigNumber(10 ** 18));
  const fundPostEur = new BigNumber(
    await eurToken.methods.balanceOf(fund.vault.options.address).call(),
  );
  const post = await getAllBalances(deployed, accounts, fund);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.sub(srcAmount));
  t.deepEqual(fundPostEur, fundPreEur.add(expectedEurToken));
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
});

// test.serial('takeOrder fails if minPrice is not satisfied', async t => {
//   const srcAmount = new BigNumber(10 ** 17);
//   const destAmount = srcAmount
//     .mul(mlnPrice)
//     .div(precisionUnits)
//     .mul(2);
//   await t.throws(
//     fund.trading.methods
//       .callOnExchange(
//         0,
//         takeOrderSignature,
//         [
//           NULL_ADDRESS,
//           NULL_ADDRESS,
//           mlnToken.options.address,
//           ethToken.options.address,
//           NULL_ADDRESS,
//           NULL_ADDRESS,
//         ],
//         [
//           srcAmount.toFixed(0),
//           destAmount.toFixed(0),
//           0,
//           0,
//           0,
//           0,
//           destAmount.toFixed(0),
//           0,
//         ],
//         web3.utils.padLeft('0x0', 64),
//         web3.utils.padLeft('0x0', 64),
//         web3.utils.padLeft('0x0', 64),
//         web3.utils.padLeft('0x0', 64),
//       )
//       .send({ from: manager, gas: config.gas }),
//   );
// });

// test.serial(
//   'risk management prevents swap in the case of bad kyber network price',
//   async t => {
//     // Inflate price of mln price by 100%, RMMakeOrders only tolerates 10% deviation
//     baseBuyRate1 = [new BigNumber(mlnPrice).mul(2).toFixed()];
//     baseSellRate1 = [
//       new BigNumber(precisionUnits)
//         .mul(precisionUnits)
//         .div(baseBuyRate1)
//         .toFixed(0),
//     ];
//     const currentBlock = await web3.eth.getBlockNumber();
//     await deployed.ConversionRates.methods
//       .setBaseRate(
//         [mlnToken.options.address],
//         baseBuyRate1,
//         baseSellRate1,
//         buys,
//         sells,
//         currentBlock,
//         indices,
//       )
//       .send();
//     const srcAmount = new BigNumber(10 ** 17);
//     await t.throws(
//       fund.trading.methods
//         .callOnExchange(
//           0,
//           takeOrderSignature,
//           [
//             NULL_ADDRESS,
//             NULL_ADDRESS,
//             ethToken.options.address,
//             mlnToken.options.address,
//             NULL_ADDRESS,
//             NULL_ADDRESS,
//           ],
//           [srcAmount.toFixed(), 0, 0, 0, 0, 0, 0, 0],
//           web3.utils.padLeft('0x0', 64),
//           web3.utils.padLeft('0x0', 64),
//           web3.utils.padLeft('0x0', 64),
//           web3.utils.padLeft('0x0', 64),
//         )
//         .send({ from: manager, gas: config.gas }),
//     );
//   },
// );
