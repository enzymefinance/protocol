import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import {
  BigInteger,
  add,
  multiply,
  power,
  subtract,
  divide,
  toBI,
} from '@melonproject/token-math';
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
import { deployAndGetSystem } from '../utils/deployAndGetSystem';
import { getContract } from '~/utils/solidity/getContract';
import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';
import { increaseTime } from '~/utils/evm/increaseTime';

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
  s.wethTokenInterface = await getToken(s.environment, s.weth.options.address);
  const exchangeConfigs = {};

  // Init fees
  s.yearInSeconds = new BigInteger(31536000);
  s.managementFee = getContract(
    s.environment,
    Contracts.ManagementFee,
    await deployContract(s.environment, Contracts.ManagementFee, []),
  );
  s.managementFeeRate = multiply(
    new BigInteger(2),
    power(new BigInteger(10), new BigInteger(16)),
  );
  const fees = [
    {
      feeAddress: s.managementFee.options.address,
      feePeriod: new BigInteger(0),
      feeRate: s.managementFeeRate,
    },
  ];

  const envManager = withDifferentAccount(s.environment, s.manager);
  await beginSetup(envManager, s.version.options.address, {
    defaultTokens: [s.wethTokenInterface, s.mlnTokenInterface],
    exchangeConfigs,
    fees,
    fundName: 'Test fund',
    nativeToken: s.wethTokenInterface,
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
});

test(`fund gets ethToken from investment`, async () => {
  const initialTokenAmount = power(new BigInteger(10), new BigInteger(21));
  await s.weth.methods
    .transfer(s.investor, `${initialTokenAmount}`)
    .send({ from: s.deployer });
  const wantedShares = power(new BigInteger(10), new BigInteger(20));
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
    .send({ from: s.investor, gas: s.gas, value: '10000000000000000' });

  await updateTestingPriceFeed(s, s.environment);
  await updateTestingPriceFeed(s, s.environment);

  await s.fund.participation.methods
    .executeRequestFor(s.investor)
    .send({ from: s.investor, gas: s.gas });

  const postTotalSupply = await s.fund.shares.methods.totalSupply().call();
  expect(postTotalSupply).toEqual(add(toBI(preTotalSupply), wantedShares));
});

test(`Reward fee rewards management fee in the form of shares`, async () => {
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const preManagerShares = new BigInteger(
    await s.fund.shares.methods.balanceOf(s.manager).call(),
  );
  const fundCreationTime = new BigInteger(
    await s.managementFee.methods
      .lastPayoutTime(s.fund.feeManager.options.address)
      .call(),
  );
  const preTotalSupply = new BigInteger(
    await s.fund.shares.methods.totalSupply().call(),
  );
  const preFundCalculations = await s.fund.accounting.methods
    .performCalculations()
    .call();

  await s.fund.feeManager.methods
    .rewardManagementFee()
    .send({ from: s.manager, gas: s.gas });
  const payoutTime = new BigInteger(
    await s.managementFee.methods
      .lastPayoutTime(s.fund.feeManager.options.address)
      .call(),
  );
  const expectedPreDilutionFeeShares = divide(
    multiply(
      divide(
        multiply(preTotalSupply, toBI(s.managementFeeRate)),
        precisionUnits,
      ),
      subtract(payoutTime, fundCreationTime),
    ),
    toBI(s.yearInSeconds),
  );
  const expectedFeeShares = divide(
    multiply(preTotalSupply, expectedPreDilutionFeeShares),
    subtract(preTotalSupply, expectedPreDilutionFeeShares),
  );
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const postManagerShares = new BigInteger(
    await s.fund.shares.methods.balanceOf(s.manager).call(),
  );
  const postTotalSupply = new BigInteger(
    await s.fund.shares.methods.totalSupply().call(),
  );
  const postFundCalculations = await s.fund.accounting.methods
    .performCalculations()
    .call();

  expect(postManagerShares).toEqual(add(preManagerShares, expectedFeeShares));
  expect(postTotalSupply).toEqual(add(preTotalSupply, expectedFeeShares));
  expect(postFundCalculations.gav).toEqual(preFundCalculations.gav);
  // Find out a way to assert this
  // Share price is supposed to change due to time difference (keep constant)
  // expect(postFundCalculations.sharePrice).toEqual(
  //   preFundCalculations.sharePrice,
  // );
  expect(post.fund.weth).toEqual(pre.fund.weth);
  expect(post.manager.weth).toEqual(pre.manager.weth);
});

test(`Claims fee using triggerRewardAllFees`, async () => {
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const preManagerShares = new BigInteger(
    await s.fund.shares.methods.balanceOf(s.manager).call(),
  );
  const lastFeeConversion = new BigInteger(
    await s.managementFee.methods
      .lastPayoutTime(s.fund.feeManager.options.address)
      .call(),
  );
  const preTotalSupply = new BigInteger(
    await s.fund.shares.methods.totalSupply().call(),
  );
  const preFundCalculations = await s.fund.accounting.methods
    .performCalculations()
    .call();

  await s.fund.accounting.methods
    .triggerRewardAllFees()
    .send({ from: s.manager, gas: s.gas });
  const payoutTime = new BigInteger(
    await s.managementFee.methods
      .lastPayoutTime(s.fund.feeManager.options.address)
      .call(),
  );
  const expectedPreDilutionFeeShares = divide(
    multiply(
      divide(
        multiply(preTotalSupply, toBI(s.managementFeeRate)),
        precisionUnits,
      ),
      subtract(payoutTime, lastFeeConversion),
    ),
    toBI(s.yearInSeconds),
  );
  const expectedFeeShares = divide(
    multiply(preTotalSupply, expectedPreDilutionFeeShares),
    subtract(preTotalSupply, expectedPreDilutionFeeShares),
  );
  const expectedFeeInDenominationAsset = divide(
    multiply(expectedFeeShares, toBI(preFundCalculations.gav)),
    add(preTotalSupply, expectedFeeShares),
  );
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const postManagerShares = new BigInteger(
    await s.fund.shares.methods.balanceOf(s.manager).call(),
  );
  const postTotalSupply = new BigInteger(
    await s.fund.shares.methods.totalSupply().call(),
  );
  const postFundCalculations = await s.fund.accounting.methods
    .performCalculations()
    .call();
  const lastConversionCalculations = await s.fund.accounting.methods
    .atLastAllocation()
    .call();

  expect(postManagerShares).toEqual(add(preManagerShares, expectedFeeShares));
  expect(postTotalSupply).toEqual(add(preTotalSupply, expectedFeeShares));
  expect(postFundCalculations.gav).toEqual(preFundCalculations.gav);
  // expect(postFundCalculations.sharePrice).toEqual(
  //   preFundCalculations.sharePrice,
  // );
  expect(new BigInteger(preFundCalculations.feesInDenominationAsset)).toEqual(
    expectedFeeInDenominationAsset,
  );
  expect(new BigInteger(lastConversionCalculations.allocatedFees)).toEqual(
    expectedFeeInDenominationAsset,
  );
  expect(post.fund.weth).toEqual(pre.fund.weth);
  expect(post.manager.weth).toEqual(pre.manager.weth);
});

test(`investor redeems his shares`, async () => {
  const pre = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const investorShares = await s.fund.shares.methods
    .balanceOf(s.investor)
    .call();
  const fundCreationTime = new BigInteger(
    await s.managementFee.methods
      .lastPayoutTime(s.fund.feeManager.options.address)
      .call(),
  );
  const preTotalSupply = new BigInteger(
    await s.fund.shares.methods.totalSupply().call(),
  );

  await increaseTime(s.environment, 1000);
  await s.fund.participation.methods
    .redeem()
    .send({ from: s.investor, gas: s.gas });

  const payoutTime = new BigInteger(
    await s.managementFee.methods
      .lastPayoutTime(s.fund.feeManager.options.address)
      .call(),
  );
  const expectedPreDilutionFeeShares = divide(
    multiply(
      divide(multiply(preTotalSupply, s.managementFeeRate), precisionUnits),
      subtract(payoutTime, fundCreationTime),
    ),
    s.yearInSeconds,
  );
  const expectedFeeShares = divide(
    multiply(preTotalSupply, expectedPreDilutionFeeShares),
    subtract(preTotalSupply, expectedPreDilutionFeeShares),
  );
  console.log(expectedFeeShares);
  const post = await getAllBalances(s, s.accounts, s.fund, s.environment);
  const postFundGav = new BigInteger(
    await s.fund.accounting.methods.calcGav().call(),
  );
  const postTotalSupply = new BigInteger(
    await s.fund.shares.methods.totalSupply().call(),
  );

  expect(postTotalSupply).toEqual(
    add(subtract(preTotalSupply, toBI(investorShares)), expectedFeeShares),
  );
  expect(post.investor.weth).toEqual(
    add(
      pre.investor.weth,
      divide(
        multiply(pre.fund.weth, investorShares),
        add(preTotalSupply, expectedFeeShares),
      ),
    ),
  );
  expect(post.fund.weth).toEqual(
    subtract(pre.fund.weth, subtract(post.investor.weth, pre.investor.weth)),
  );
  expect(postFundGav).toEqual(post.fund.weth);
});
