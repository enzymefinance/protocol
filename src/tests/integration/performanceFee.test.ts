import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import {
  BigInteger,
  add,
  multiply,
  power,
  subtract,
  divide,
} from '@melonproject/token-math/bigInteger';
import { updateTestingPriceFeed } from '../utils/updateTestingPriceFeed';
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
  s.performanceFee = getContract(
    s.environment,
    Contracts.PerformanceFee,
    await deployContract(s.environment, Contracts.PerformanceFee, []),
  );
  s.performanceFeePeriod = new BigInteger(1000);
  s.performanceFeeRate = new BigInteger(
    multiply(new BigInteger(2), power(new BigInteger(10), new BigInteger(17))),
  );
  const fees = [
    {
      feeAddress: s.managementFee.options.address,
      feePeriod: new BigInteger(0),
      feeRate: new BigInteger(0),
    },
    {
      feeAddress: s.performanceFee.options.address,
      feePeriod: s.performanceFeePeriod,
      feeRate: s.performanceFeeRate,
    },
  ];

  const envManager = withDifferentAccount(s.environment, s.manager);
  await beginSetup(envManager, s.version.options.address, {
    defaultTokens: [s.wethTokenInterface, s.mlnTokenInterface],
    exchangeConfigs,
    fees,
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
});

test(`fund gets ethToken from investment`, async () => {
  const initialTokenAmount = power(new BigInteger(10), new BigInteger(21));
  await s.weth.methods
    .transfer(s.investor, `${initialTokenAmount}`)
    .send({ from: s.deployer });
  s.wantedShares = power(new BigInteger(10), new BigInteger(20));
  const preTotalSupply = await s.fund.shares.methods.totalSupply().call();
  await s.weth.methods
    .approve(s.fund.participation.options.address, s.wantedShares)
    .send({ from: s.investor, gas: s.gas });
  await s.fund.participation.methods
    .requestInvestment(
      `${s.wantedShares}`,
      `${s.wantedShares}`,
      s.weth.options.address,
    )
    .send({ from: s.investor, gas: s.gas });
  await updateTestingPriceFeed(s, s.environment);
  await updateTestingPriceFeed(s, s.environment);

  await s.fund.participation.methods
    .executeRequestFor(s.investor)
    .send({ from: s.investor, gas: s.gas });

  const postTotalSupply = await s.fund.shares.methods.totalSupply().call();
  expect(postTotalSupply).toEqual(add(preTotalSupply, s.wantedShares));
});

test(`artificially inflate share price by inflating weth`, async () => {
  const preTotalSupply = new BigInteger(
    await s.fund.shares.methods.totalSupply().call(),
  );
  const preFundCalculations = await s.fund.accounting.methods
    .performCalculations()
    .call();

  await s.weth.methods
    .transfer(s.fund.vault.options.address, `${s.wantedShares}`)
    .send({ from: s.deployer });

  const postTotalSupply = new BigInteger(
    await s.fund.shares.methods.totalSupply().call(),
  );
  const postFundCalculations = await s.fund.accounting.methods
    .performCalculations()
    .call();
  const feeInDenominationAsset = divide(
    multiply(postFundCalculations.feesInShares, postFundCalculations.gav),
    add(postTotalSupply, postFundCalculations.feesInShares),
  );
  const sharePriceUsingNav = divide(
    multiply(new BigInteger(postFundCalculations.nav), precisionUnits),
    postTotalSupply,
  );
  const sharePriceUsingGav = divide(
    multiply(
      subtract(
        new BigInteger(postFundCalculations.gav),
        feeInDenominationAsset,
      ),
      precisionUnits,
    ),
    postTotalSupply,
  );

  expect(postTotalSupply).toEqual(preTotalSupply);
  expect(Number(postFundCalculations.sharePrice)).toBeGreaterThan(
    Number(preFundCalculations.sharePrice),
  );
  expect(new BigInteger(postFundCalculations.sharePrice)).toEqual(
    sharePriceUsingGav,
  );
  expect(new BigInteger(postFundCalculations.sharePrice)).toEqual(
    sharePriceUsingNav,
  );
});

test(`performance fee is calculated correctly`, async () => {
  const lastHWM = await s.performanceFee.methods
    .highWaterMark(s.fund.feeManager.options.address)
    .call();
  const currentTotalSupply = new BigInteger(
    await s.fund.shares.methods.totalSupply().call(),
  );
  const fundCalculations = await s.fund.accounting.methods
    .performCalculations()
    .call();
  const gavPerShare = divide(
    multiply(fundCalculations.gav, precisionUnits),
    currentTotalSupply,
  );
  const gainInSharePrice = subtract(gavPerShare, lastHWM);
  const expectedPerformanceFee = divide(
    multiply(
      divide(multiply(gainInSharePrice, s.performanceFeeRate), precisionUnits),
      currentTotalSupply,
    ),
    precisionUnits,
  );
  const expectedFeeSharesPreDilution = divide(
    multiply(currentTotalSupply, expectedPerformanceFee),
    fundCalculations.gav,
  );
  const expectedFeeShares = divide(
    multiply(currentTotalSupply, expectedFeeSharesPreDilution),
    subtract(currentTotalSupply, expectedFeeSharesPreDilution),
  );

  expect(new BigInteger(fundCalculations.feesInShares)).toEqual(
    expectedFeeShares,
  );
  // expect(new BigInteger(fundCalculations.feesInDenominationAsset)).toEqual(
  //   expectedPerformanceFee,
  // );
});

test(`manager calls rewardAllFees to update high watermark`, async () => {
  await increaseTime(s.environment, Number(s.performanceFeePeriod));

  const preManagerShares = new BigInteger(
    await s.fund.shares.methods.balanceOf(s.manager).call(),
  );
  const preFundCalculations = await s.fund.accounting.methods
    .performCalculations()
    .call();
  console.log('a-----asd');
  await s.fund.accounting.methods
    .triggerRewardAllFees()
    .send({ from: s.manager, gas: s.gas });

  const currentHWM = await s.performanceFee.methods
    .highWaterMark(s.fund.feeManager.options.address)
    .call();
  const postManagerShares = new BigInteger(
    await s.fund.shares.methods.balanceOf(s.manager).call(),
  );
  const postFundCalculations = await s.fund.accounting.methods
    .performCalculations()
    .call();

  expect(subtract(postManagerShares, preManagerShares)).toEqual(
    new BigInteger(preFundCalculations.feesInShares),
  );
  expect(postFundCalculations.sharePrice).toEqual(
    preFundCalculations.sharePrice,
  );
  expect(currentHWM).toEqual(preFundCalculations.sharePrice);
  expect(postFundCalculations.gav).toEqual(preFundCalculations.gav);
  // expect(new BigInteger(fundCalculations.feesInDenominationAsset)).toEqual(
  //   expectedPerformanceFee,
  // );
});
