import {
  BigInteger,
  add,
  subtract,
  power,
} from '@melonproject/token-math/bigInteger';
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
import { Exchanges, Contracts } from '~/Contracts';
import { withDifferentAccount } from '~/utils/environment/withDifferentAccount';
import { deployAndGetSystem } from '../utils/deployAndGetSystem';
import { deployContract } from '~/utils/solidity/deployContract';
import { registerAsset } from '~/contracts/version/transactions/registerAsset';
import { getContract } from '~/utils/solidity/getContract';

let s: any = {};

beforeAll(async () => {
  s.environment = await initTestEnvironment();
  s.accounts = await s.environment.eth.getAccounts();
  const { addresses, contracts } = await deployAndGetSystem(s.environment);
  s = Object.assign(s, contracts);
  s.addresses = addresses;
  s.mlnTokenInterface = await getToken(s.environment, s.mln.options.address);
  s.wethTokenInterface = await getToken(s.environment, s.weth.options.address);
  [s.deployer, s.manager, s.investor] = s.accounts;
  s.gas = 8000000;
  s.opts = { from: s.deployer, gas: s.gas };
  const exchangeConfigs = {};

  const maliciousTokenAddress = await deployContract(
    s.environment,
    Contracts.MaliciousToken,
    ['MLC', 18, 'Malicious'],
  );

  await registerAsset(s.environment, s.registry.options.address, {
    assetAddress: maliciousTokenAddress.toLowerCase(),
    assetSymbol: 'MLC',
    decimals: 18,
    name: '',
    reserveMin: '',
    sigs: [],
    standards: [],
    url: '',
  });

  s.maliciousToken = await getContract(
    s.environment,
    Contracts.MaliciousToken,
    maliciousTokenAddress,
  );

  s.maliciousTokenInterface = await getToken(
    s.environment,
    maliciousTokenAddress.toLowerCase(),
  );

  const envManager = withDifferentAccount(s.environment, s.manager);
  await beginSetup(envManager, s.version.options.address, {
    defaultTokens: [
      s.wethTokenInterface,
      s.mlnTokenInterface,
      s.maliciousTokenInterface,
    ],
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

test(`General redeem fails in presence of malicious token`, async () => {
  await s.maliciousToken.methods
    .transfer(s.fund.vault.options.address, 1000000)
    .send({ from: s.deployer, gas: s.gas });
  await s.maliciousToken.methods
    .startReverting()
    .send({ from: s.deployer, gas: s.gas });
  expect(
    s.fund.participation.methods
      .redeem()
      .send({ from: s.investor, gas: s.gas }),
  ).rejects.toThrow();
});

test(`Redeem with constraints works as expected`, async () => {
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const investorShares = await s.fund.shares.methods
    .balanceOf(s.investor)
    .call();
  const preTotalSupply = await s.fund.shares.methods.totalSupply().call();
  await s.fund.participation.methods
    .redeemWithConstraints(investorShares, [s.weth.options.address])
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
