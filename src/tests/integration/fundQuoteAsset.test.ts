import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployAndGetSystem } from '~/utils/deployAndGetSystem';
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
import { beginSetup } from '~/contracts/factory/transactions/beginSetup';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { completeSetup } from '~/contracts/factory/transactions/completeSetup';
import { createAccounting } from '~/contracts/factory/transactions/createAccounting';
import { createFeeManager } from '~/contracts/factory/transactions/createFeeManager';
import { createParticipation } from '~/contracts/factory/transactions/createParticipation';
import { createPolicyManager } from '~/contracts/factory/transactions/createPolicyManager';
import { createShares } from '~/contracts/factory/transactions/createShares';
import { createTrading } from '~/contracts/factory/transactions/createTrading';
import { createVault } from '~/contracts/factory/transactions/createVault';
import { getFundComponents } from '~/utils/getFundComponents';
import { withDifferentAccount } from '~/utils/environment/withDifferentAccount';

const precisionUnits = power(new BigInteger(10), new BigInteger(18));

let s: any = {};

beforeAll(async () => {
  s.environment = await initTestEnvironment();
  s.accounts = await s.environment.eth.getAccounts();
  const { addresses, contracts } = await deployAndGetSystem(s.environment);
  s.addresses = addresses;
  s = Object.assign(s, contracts);

  [s.deployer, s.manager, s.investor] = s.accounts;
  s.gas = 8000000;

  s.mlnTokenInterface = await getToken(s.environment, s.mln.options.address);
  s.dgxTokenInterface = await getToken(s.environment, s.dgx.options.address);
  s.wethTokenInterface = await getToken(s.environment, s.weth.options.address);
  const exchangeConfigs = {};
  const envManager = withDifferentAccount(s.environment, s.manager);
  await beginSetup(envManager, s.version.options.address, {
    defaultTokens: [
      s.wethTokenInterface,
      s.mlnTokenInterface,
      s.dgxTokenInterface,
    ],
    exchangeConfigs,
    fees: [],
    fundName: 'Test fund',
    nativeToken: s.wethTokenInterface,
    priceSource: s.priceSource.options.address,
    quoteToken: s.dgxTokenInterface,
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
});

test('Transfer ethToken to the investor', async () => {
  const initialTokenAmount = power(new BigInteger(10), new BigInteger(21));
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  await s.weth.methods
    .transfer(s.investor, `${initialTokenAmount}`)
    .send({ from: s.deployer });
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  expect(post.investor.weth).toEqual(
    add(pre.investor.weth, initialTokenAmount),
  );
});

test(`fund gets non-denomination asset from investment`, async () => {
  const wantedShares = power(new BigInteger(10), new BigInteger(20));
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const preTotalSupply = await s.fund.shares.methods.totalSupply().call();

  await s.weth.methods
    .approve(s.fund.participation.options.address, wantedShares)
    .send({ from: s.investor, gas: s.gas });
  await s.fund.participation.methods
    .requestInvestment(
      `${wantedShares}`,
      `${wantedShares}`,
      s.weth.options.address,
    )
    .send({ from: s.investor, gas: s.gas });

  const fundDenominationAsset = await s.fund.accounting.methods
    .DENOMINATION_ASSET()
    .call();
  const [dgxPriceInWeth] = Object.values(
    await s.priceSource.methods
      .getReferencePriceInfo(fundDenominationAsset, s.weth.options.address)
      .call(),
  ).map(e => new BigInteger(e));
  const expectedCostOfShares = divide(
    multiply(wantedShares, dgxPriceInWeth),
    precisionUnits,
  );
  const actualCostOfShares = new BigInteger(
    await s.fund.accounting.methods
      .getShareCostInAsset(`${wantedShares}`, s.weth.options.address)
      .call(),
  );

  await updateTestingPriceFeed(s, s.environment);
  await updateTestingPriceFeed(s, s.environment);

  await s.fund.participation.methods
    .executeRequestFor(s.investor)
    .send({ from: s.investor, gas: s.gas });

  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const postTotalSupply = await s.fund.shares.methods.totalSupply().call();
  const postFundGav = new BigInteger(
    await s.fund.accounting.methods.calcGav().call(),
  );
  const [wethPriceInDgx] = Object.values(
    await s.priceSource.methods
      .getReferencePriceInfo(s.weth.options.address, fundDenominationAsset)
      .call(),
  ).map(e => new BigInteger(e));
  expect(fundDenominationAsset).toEqual(s.dgx.options.address);
  expect(postTotalSupply).toEqual(add(preTotalSupply, wantedShares));
  expect(expectedCostOfShares).toEqual(actualCostOfShares);
  expect(post.investor.weth).toEqual(
    subtract(pre.investor.weth, expectedCostOfShares),
  );
  expect(post.fund.weth).toEqual(add(pre.fund.weth, expectedCostOfShares));
  expect(postFundGav).toEqual(
    add(
      pre.fund.weth,
      divide(multiply(expectedCostOfShares, wethPriceInDgx), precisionUnits),
    ),
  );
});

test(`investor redeems his shares`, async () => {
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const investorShares = await s.fund.shares.methods
    .balanceOf(s.investor)
    .call();
  const preTotalSupply = await s.fund.shares.methods.totalSupply().call();

  await s.fund.participation.methods
    .redeem()
    .send({ from: s.investor, gas: s.gas });

  const postFundGav = new BigInteger(
    await s.fund.accounting.methods.calcGav().call(),
  );

  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const postTotalSupply = await s.fund.shares.methods.totalSupply().call();
  expect(postTotalSupply).toEqual(subtract(preTotalSupply, investorShares));
  expect(post.investor.weth).toEqual(add(pre.investor.weth, pre.fund.weth));
  expect(post.fund.weth).toEqual(new BigInteger(0));
  expect(postFundGav).toEqual(new BigInteger(0));
});
