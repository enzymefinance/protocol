import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
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
import { getAllBalances } from '../utils/getAllBalances';
import { registerFees } from '~/contracts/version/transactions/registerFees';
import { BN } from 'web3-utils';
import { BNExpDiv, BNExpMul } from '../utils/new/BNmath';

let environment;
let accounts;
let deployer, manager, investor;
let fund;
let mlnTokenInfo, wethTokenInfo;
let managementFee, performanceFee, performanceFeePeriod, performanceFeeRate;
let system = {};
let wantedShares;
const defaultGas = 8000000;

beforeAll(async () => {
  environment = await initTestEnvironment();
  accounts = await environment.eth.getAccounts();
  const { contracts } = await deployAndGetSystem(environment);
  system = Object.assign(system, contracts);

  [deployer, manager, investor] = accounts;

  mlnTokenInfo = await getToken(environment, system.mln.options.address);
  wethTokenInfo = await getToken(environment, system.weth.options.address);
  const exchangeConfigs = {};

  // Init fees
  managementFee = getContract(
    environment,
    Contracts.ManagementFee,
    await deployContract(environment, Contracts.ManagementFee, []),
  );
  performanceFee = getContract(
    environment,
    Contracts.PerformanceFee,
    await deployContract(environment, Contracts.PerformanceFee, []),
  );
  performanceFeePeriod = new BN(1000);
  performanceFeeRate = new BN(2).mul(new BN(10).pow(new BN(17)));
  const fees = [
    {
      feeAddress: managementFee.options.address,
      feePeriod: new BN(0),
      feeRate: new BN(0),
    },
    {
      feeAddress: performanceFee.options.address,
      feePeriod: performanceFeePeriod,
      feeRate: performanceFeeRate,
    },
  ];
  const envManager = withDifferentAccount(environment, manager);

  await registerFees(environment, system.registry.options.address, {
    addresses: fees.map(f => f.feeAddress),
  });

  await beginSetup(envManager, system.version.options.address, {
    defaultTokens: [wethTokenInfo, mlnTokenInfo],
    exchangeConfigs,
    fees,
    fundName: 'Test fund',
    quoteToken: wethTokenInfo,
  });
  await createAccounting(envManager, system.version.options.address);
  await createFeeManager(envManager, system.version.options.address);
  await createParticipation(envManager, system.version.options.address);
  await createPolicyManager(envManager, system.version.options.address);
  await createShares(envManager, system.version.options.address);
  await createTrading(envManager, system.version.options.address);
  await createVault(envManager, system.version.options.address);
  const hubAddress = await completeSetup(envManager, system.version.options.address);
  fund = await getFundComponents(envManager, hubAddress);
  await updateTestingPriceFeed(system, environment);
});

test(`fund gets ethToken from investment`, async () => {
  const initialTokenAmount = new BN(10).pow(new BN(21));
  await system.weth.methods
    .transfer(investor, `${initialTokenAmount}`)
    .send({ from: deployer });
  wantedShares = new BN(10).pow(new BN(20));
  const preTotalSupply = await fund.shares.methods.totalSupply().call();
  await system.weth.methods
    .approve(fund.participation.options.address, `${wantedShares}`)
    .send({ from: investor, gas: defaultGas });
  await fund.participation.methods
    .requestInvestment(
      `${wantedShares}`,
      `${wantedShares}`,
      system.weth.options.address,
    )
    .send({ from: investor, gas: defaultGas, value: '10000000000000000' });
  await updateTestingPriceFeed(system, environment);
  await updateTestingPriceFeed(system, environment);

  await fund.participation.methods
    .executeRequestFor(investor)
    .send({ from: investor, gas: defaultGas });

  const postTotalSupply = await fund.shares.methods.totalSupply().call();
  expect(new BN(postTotalSupply).eq(new BN(preTotalSupply).add(wantedShares))).toBe(true);
});

test(`artificially inflate share price by inflating weth`, async () => {
  const preTotalSupply = new BN(
    await fund.shares.methods.totalSupply().call(),
  );
  const preFundCalculations = await fund.accounting.methods
    .performCalculations()
    .call();

  await system.weth.methods
    .transfer(fund.vault.options.address, `${wantedShares}`)
    .send({ from: deployer });

  const postTotalSupply = new BN(
    await fund.shares.methods.totalSupply().call(),
  );
  const postFundCalculations = await fund.accounting.methods
    .performCalculations()
    .call();

  const feeInDenominationAsset = new BN(postFundCalculations.feesInShares)
    .mul(new BN(postFundCalculations.gav))
    .div(
      postTotalSupply.add(new BN(postFundCalculations.feesInShares))
    );

  const sharePriceUsingNav = BNExpDiv(
    new BN(postFundCalculations.nav),
    postTotalSupply,
  );

  const sharePriceUsingGav = BNExpDiv(
    new BN(postFundCalculations.gav).sub(feeInDenominationAsset),
    postTotalSupply,
  );

  expect(postTotalSupply.toString()).toEqual(preTotalSupply.toString());
  expect(Number(postFundCalculations.sharePrice)).toBeGreaterThan(
    Number(preFundCalculations.sharePrice),
  );
  expect(postFundCalculations.sharePrice).toEqual(sharePriceUsingGav.toString());
  expect(postFundCalculations.sharePrice).toEqual(sharePriceUsingNav.toString());
});

test(`performance fee is calculated correctly`, async () => {
  const lastHWM = await performanceFee.methods
    .highWaterMark(fund.feeManager.options.address)
    .call();
  const currentTotalSupply = new BN(
    await fund.shares.methods.totalSupply().call(),
  );
  const fundCalculations = await fund.accounting.methods
    .performCalculations()
    .call();
  const gavePerShare = BNExpDiv(
    new BN(fundCalculations.gav),
    currentTotalSupply,
  );
  const gainInSharePrice = gavePerShare.sub(new BN(lastHWM));

  const expectedPerformanceFee = BNExpMul(
    BNExpMul(
      gainInSharePrice,
      new BN(performanceFeeRate),
    ),
    currentTotalSupply,
  );

  const expectedFeeSharesPreDilution = currentTotalSupply
    .mul(expectedPerformanceFee)
    .div(new BN(fundCalculations.gav));

  const expectedFeeShares = currentTotalSupply
    .mul(expectedFeeSharesPreDilution)
    .div(
      currentTotalSupply.sub(expectedFeeSharesPreDilution),
    );

  expect(fundCalculations.feesInShares).toEqual(expectedFeeShares.toString());
  expect(Number(fundCalculations.feesInDenominationAsset)).toBeCloseTo(
    Number(expectedPerformanceFee),
  );
});

test(`investor redeems half his shares, performance fee deducted`, async () => {
  const currentTotalSupply = new BN(
    await fund.shares.methods.totalSupply().call(),
  );
  const preManagerShares = new BN(
    await fund.shares.methods.balanceOf(manager).call(),
  );
  const pre = await getAllBalances(system, accounts, fund, environment);
  const fundCalculations = await fund.accounting.methods
    .performCalculations()
    .call();
  const redeemingQuantity = wantedShares.div(new BN(2));
  await fund.participation.methods
    .redeemQuantity(`${redeemingQuantity}`)
    .send({ from: investor, gas: defaultGas });
  const postManagerShares = new BN(
    await fund.shares.methods.balanceOf(manager).call(),
  );

  const redeemSharesProportion = BNExpDiv(redeemingQuantity, currentTotalSupply);
  const redeemSharesProportionAccountingInflation = BNExpDiv(
    redeemingQuantity,
    currentTotalSupply.add(new BN(fundCalculations.feesInShares)),
  );
  const expectedOwedPerformanceFee = BNExpMul(
    redeemSharesProportionAccountingInflation,
    new BN(fundCalculations.feesInShares),
  );
  expect(postManagerShares.sub(preManagerShares).toString())
    .toEqual(expectedOwedPerformanceFee.toString());

  await fund.participation.methods
    .redeem()
    .send({ from: manager, gas: defaultGas });
  const post = await getAllBalances(system, accounts, fund, environment);

  expect(Number(post.manager.weth.sub(pre.manager.weth)))
    .toBeCloseTo(
      Number(
        BNExpMul(
          new BN(fundCalculations.feesInDenominationAsset),
          redeemSharesProportion,
        ),
      ),
    );
});

test(`manager calls rewardAllFees to update high watermark`, async () => {
  await increaseTime(environment, Number(performanceFeePeriod));

  const preManagerShares = new BN(
    await fund.shares.methods.balanceOf(manager).call(),
  );
  const preFundCalculations = await fund.accounting.methods
    .performCalculations()
    .call();
  await fund.accounting.methods
    .triggerRewardAllFees()
    .send({ from: manager, gas: defaultGas });

  const currentHWM = await performanceFee.methods
    .highWaterMark(fund.feeManager.options.address)
    .call();
  const postManagerShares = new BN(
    await fund.shares.methods.balanceOf(manager).call(),
  );
  const postFundCalculations = await fund.accounting.methods
    .performCalculations()
    .call();

  expect(postManagerShares.sub(preManagerShares).toString()).toEqual(
    preFundCalculations.feesInShares
  );
  expect(postFundCalculations.sharePrice).toEqual(
    preFundCalculations.sharePrice,
  );
  expect(currentHWM).toEqual(preFundCalculations.gavPerShareNetManagementFee);
  expect(postFundCalculations.gav).toEqual(preFundCalculations.gav);
  // expect(new BigInteger(fundCalculations.feesInDenominationAsset)).toEqual(
    // expectedPerformanceFee,
  // );
});
