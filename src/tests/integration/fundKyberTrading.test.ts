import { takeOrderSignature } from '~/utils/constants/orderSignatures';
import {
  BigInteger,
  add,
  subtract,
  multiply,
  divide,
  power,
} from '@melonproject/token-math';
import { updateTestingPriceFeed } from '../utils/updateTestingPriceFeed';
import { getAllBalances } from '../utils/getAllBalances';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
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
import { deployAndGetSystem } from '../utils/deployAndGetSystem';

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
    .send({ from: s.investor, gas: s.gas, value: '10000000000000000' });
  await s.fund.participation.methods
    .executeRequestFor(s.investor)
    .send({ from: s.investor, gas: s.gas });
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);

  expect(post.investor.weth).toEqual(subtract(pre.investor.weth, offeredValue));
  expect(post.fund.weth).toEqual(add(pre.fund.weth, offeredValue));
});

test('swap ethToken for mln with specific order price (minRate)', async () => {
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
        s.mln.options.address,
        s.weth.options.address,
        NULL_ADDRESS,
        NULL_ADDRESS,
      ],
      [`${destAmount}`, `${srcAmount}`, 0, 0, 0, 0, `${srcAmount}`, 0],
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
  const srcAmount = power(new BigInteger(10), new BigInteger(16));
  const [bestRate] = Object.values(
    await s.kyberNetwork.methods
      .getExpectedRate(s.mln.options.address, kyberEthAddress, `${srcAmount}`)
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
        s.weth.options.address,
        s.mln.options.address,
        NULL_ADDRESS,
        NULL_ADDRESS,
      ],
      [`${destAmount}`, `${srcAmount}`, 0, 0, 0, 0, `${srcAmount}`, 0],
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
  expect(post.fund.mln).toEqual(subtract(pre.fund.mln, srcAmount));
  expect(post.fund.weth).toEqual(add(pre.fund.weth, expectedWeth));
});

test('swap mlnToken directly to eurToken without minimum destAmount', async () => {
  const srcAmount = new BigInteger(10 ** 16);
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const preFundEur = new BigInteger(
    await s.eur.methods.balanceOf(s.fund.vault.options.address).call(),
  );
  const [bestRate] = Object.values(
    await s.kyberNetwork.methods
      .getExpectedRate(
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
        s.eur.options.address,
        s.mln.options.address,
        NULL_ADDRESS,
        NULL_ADDRESS,
      ],
      [`${destAmount}`, `${srcAmount}`, 0, 0, 0, 0, `${srcAmount}`, 0],
      randomHexOfSize(20),
      '0x0',
      '0x0',
      '0x0',
    )
    .send({ from: s.manager, gas: s.gas });
  const expectedEur = divide(
    multiply(srcAmount, bestRate),
    new BigInteger(10 ** 18),
  );
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const postFundEur = new BigInteger(
    await s.eur.methods.balanceOf(s.fund.vault.options.address).call(),
  );

  expect(post.fund.weth).toEqual(pre.fund.weth);
  expect(post.fund.mln).toEqual(subtract(pre.fund.mln, srcAmount));
  expect(postFundEur).toEqual(add(preFundEur, expectedEur));
});

test('takeOrder fails if minPrice is not satisfied', async () => {
  const srcAmount = new BigInteger(10 ** 17);
  const [bestRate] = Object.values(
    await s.kyberNetwork.methods
      .getExpectedRate(
        s.mln.options.address,
        s.eur.options.address,
        `${srcAmount}`,
      )
      .call(),
  ).map(e => new BigInteger(e));
  const destAmount = divide(
    multiply(multiply(srcAmount, bestRate), new BigInteger(2)),
    precisionUnits,
  );
  expect(
    s.fund.trading.methods
      .callOnExchange(
        0,
        takeOrderSignature,
        [
          NULL_ADDRESS,
          NULL_ADDRESS,
          s.eur.options.address,
          s.mln.options.address,
          NULL_ADDRESS,
          NULL_ADDRESS,
        ],
        [`${destAmount}`, `${srcAmount}`, 0, 0, 0, 0, `${srcAmount}`, 0],
        randomHexOfSize(20),
        '0x0',
        '0x0',
        '0x0',
      )
      .send({ from: s.manager, gas: s.gas }),
  ).resolves.toThrow();
});
