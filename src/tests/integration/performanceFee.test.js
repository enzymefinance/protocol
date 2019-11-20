import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { updateTestingPriceFeed } from '../utils/updateTestingPriceFeed';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { getFundComponents } from '~/utils/getFundComponents';
import { withDifferentAccount } from '~/utils/environment/withDifferentAccount';
import { deployAndGetSystem } from '../utils/deployAndGetSystem';
import { getContract } from '~/utils/solidity/getContract';
import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';
import { increaseTime } from '~/utils/evm/increaseTime';
import { getAllBalances } from '../utils/getAllBalances';
import { toWei, BN, padLeft, stringToHex } from 'web3-utils';
import { BNExpDiv, BNExpMul } from '../utils/new/BNmath';

let environment, accounts;
let defaultTxOpts, investorTxOpts, managerTxOpts;
let deployer, manager, investor;
let fund;
let managementFee, performanceFee;
let performanceFeePeriod = '1000';
let performanceFeeRate = toWei('.2', 'ether');
let wantedShares;
let contracts;

beforeAll(async () => {
  environment = await initTestEnvironment();
  accounts = await environment.eth.getAccounts();
  [deployer, manager, investor] = accounts;

  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  const system = await deployAndGetSystem(environment);
  contracts = system.contracts;

  const {
    mln,
    weth,
    version,
    version: fundFactory,
    registry,
  } = contracts;

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

  const envManager = withDifferentAccount(environment, manager);
  const feeAddresses = [
    managementFee.options.address,
    performanceFee.options.address
  ];

  await registry.methods.registerFees(feeAddresses).send(defaultTxOpts);

  const fundName = padLeft(stringToHex('Test fund'), 64);
  await fundFactory.methods
    .beginSetup(
      fundName,
      feeAddresses,
      [0, performanceFeeRate],
      [0, performanceFeePeriod],
      [],
      [],
      weth.options.address,
      [weth.options.address, mln.options.address],
    )
    .send(managerTxOpts);
  await fundFactory.methods.createAccounting().send(managerTxOpts);
  await fundFactory.methods.createFeeManager().send(managerTxOpts);
  await fundFactory.methods.createParticipation().send(managerTxOpts);
  await fundFactory.methods.createPolicyManager().send(managerTxOpts);
  await fundFactory.methods.createShares().send(managerTxOpts);
  await fundFactory.methods.createTrading().send(managerTxOpts);
  await fundFactory.methods.createVault().send(managerTxOpts);
  const res = await fundFactory.methods.completeSetup().send(managerTxOpts);
  const hubAddress = res.events.NewFund.returnValues.hub;
  fund = await getFundComponents(envManager, hubAddress);
  await updateTestingPriceFeed(contracts, environment);
});

test(`fund gets ethToken from investment`, async () => {
  const { weth } = contracts;
  const initialTokenAmount = new BN(10).pow(new BN(21));
  await weth.methods
    .transfer(investor, `${initialTokenAmount}`)
    .send(defaultTxOpts);
  wantedShares = new BN(10).pow(new BN(20));
  const preTotalSupply = await fund.shares.methods.totalSupply().call();
  await weth.methods
    .approve(fund.participation.options.address, `${wantedShares}`)
    .send(investorTxOpts);
  await fund.participation.methods
    .requestInvestment(
      `${wantedShares}`,
      `${wantedShares}`,
      weth.options.address,
    )
    .send({ ...investorTxOpts, value: toWei('.1', 'ether')});
  await updateTestingPriceFeed(contracts, environment);
  await updateTestingPriceFeed(contracts, environment);

  await fund.participation.methods
    .executeRequestFor(investor)
    .send(investorTxOpts);

  const postTotalSupply = await fund.shares.methods.totalSupply().call();
  expect(new BN(postTotalSupply).eq(new BN(preTotalSupply).add(wantedShares))).toBe(true);
});

test(`artificially inflate share price by inflating weth`, async () => {
  const { weth } = contracts;
  const preTotalSupply = new BN(
    await fund.shares.methods.totalSupply().call(),
  );
  const preFundCalculations = await fund.accounting.methods
    .performCalculations()
    .call();

  await weth.methods
    .transfer(fund.vault.options.address, `${wantedShares}`)
    .send(defaultTxOpts);

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

  expect(postTotalSupply).toEqualBN(preTotalSupply);
  expect(Number(postFundCalculations.sharePrice)).toBeGreaterThan(
    Number(preFundCalculations.sharePrice),
  );
  expect(postFundCalculations.sharePrice).toBe(`${sharePriceUsingGav}`);
  expect(postFundCalculations.sharePrice).toBe(`${sharePriceUsingNav}`);
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

  expect(fundCalculations.feesInShares).toBe(`${expectedFeeShares}`);
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
  const pre = await getAllBalances(contracts, accounts, fund, environment);
  const fundCalculations = await fund.accounting.methods
    .performCalculations()
    .call();
  const redeemingQuantity = wantedShares.div(new BN(2));
  await fund.participation.methods
    .redeemQuantity(`${redeemingQuantity}`)
    .send(investorTxOpts);
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
  expect(postManagerShares.sub(preManagerShares))
    .toEqualBN(expectedOwedPerformanceFee);

  await fund.participation.methods
    .redeem()
    .send(managerTxOpts);
  const post = await getAllBalances(contracts, accounts, fund, environment);

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
    .send(managerTxOpts);

  const currentHWM = await performanceFee.methods
    .highWaterMark(fund.feeManager.options.address)
    .call();
  const postManagerShares = new BN(
    await fund.shares.methods.balanceOf(manager).call(),
  );
  const postFundCalculations = await fund.accounting.methods
    .performCalculations()
    .call();

  expect(postManagerShares.sub(preManagerShares).toString()).toBe(
    preFundCalculations.feesInShares
  );
  expect(postFundCalculations.sharePrice).toBe(
    preFundCalculations.sharePrice,
  );
  expect(currentHWM).toBe(preFundCalculations.gavPerShareNetManagementFee);
  expect(postFundCalculations.gav).toBe(preFundCalculations.gav);
  // expect(new BigInteger(fundCalculations.feesInDenominationAsset)).toEqual(
    // expectedPerformanceFee,
  // );
});
