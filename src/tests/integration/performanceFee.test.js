import { toWei, BN } from 'web3-utils';

import { deploy, fetchContract } from '~/../deploy/utils/deploy-contract';
import { partialRedeploy } from '~/../deploy/scripts/deploy-system';
import web3 from '~/../deploy/utils/get-web3';

import { BNExpDiv, BNExpMul } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { stringToBytes } from '~/tests/utils/formatting';
import getAllBalances from '~/tests/utils/getAllBalances';
import getFundComponents from '~/tests/utils/getFundComponents';
import { increaseTime } from '~/tests/utils/rpc';
import updateTestingPriceFeed from '~/tests/utils/updateTestingPriceFeed';

let environment, accounts;
let defaultTxOpts, investorTxOpts, managerTxOpts;
let deployer, manager, investor;
let performanceFeePeriod = '1000';
let performanceFeeRate = toWei('.2', 'ether');
let wantedShares;
let contracts, deployOut;
let mln, weth, version, registry, managementFee, performanceFee, fund;

beforeAll(async () => {
  accounts = await web3.eth.getAccounts();
  [deployer, manager, investor] = accounts;

  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  const deployed = await partialRedeploy(CONTRACT_NAMES.VERSION);
  contracts = deployed.contracts;
  deployOut = deployed.deployOut;

  mln = contracts.MLN;
  weth = contracts.WETH;
  version = contracts.Version;
  registry = contracts.Registry;
  managementFee = contracts.ManagementFee;
  performanceFee = contracts.PerformanceFee;

  const feeAddresses = [
    managementFee.options.address,
    performanceFee.options.address
  ];

  await registry.methods.registerFees(feeAddresses).send(defaultTxOpts);

  const fundName = stringToBytes('Test fund', 32);
  await version.methods
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
  await version.methods.createAccounting().send(managerTxOpts);
  await version.methods.createFeeManager().send(managerTxOpts);
  await version.methods.createParticipation().send(managerTxOpts);
  await version.methods.createPolicyManager().send(managerTxOpts);
  await version.methods.createShares().send(managerTxOpts);
  await version.methods.createTrading().send(managerTxOpts);
  await version.methods.createVault().send(managerTxOpts);
  const res = await version.methods.completeSetup().send(managerTxOpts);
  const hubAddress = res.events.NewFund.returnValues.hub;
  fund = await getFundComponents(hubAddress);
  await updateTestingPriceFeed(contracts.TestingPriceFeed, Object.values(deployOut.tokens.addr));
});

test(`fund gets ethToken from investment`, async () => {
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
  await updateTestingPriceFeed(contracts.TestingPriceFeed, Object.values(deployOut.tokens.addr));
  await updateTestingPriceFeed(contracts.TestingPriceFeed, Object.values(deployOut.tokens.addr));

  await fund.participation.methods
    .executeRequestFor(investor)
    .send(investorTxOpts);

  const postTotalSupply = await fund.shares.methods.totalSupply().call();
  expect(new BN(postTotalSupply.toString()).eq(new BN(preTotalSupply.toString()).add(wantedShares))).toBe(true);
});

test(`artificially inflate share price by inflating weth`, async () => {
  const preTotalSupply = new BN(
    (await fund.shares.methods.totalSupply().call()).toString()
  );
  const preFundCalculations = await fund.accounting.methods
    .performCalculations()
    .call();

  await weth.methods
    .transfer(fund.vault.options.address, `${wantedShares}`)
    .send(defaultTxOpts);

  const postTotalSupply = new BN(
    (await fund.shares.methods.totalSupply().call()).toString()
  );
  const postFundCalculations = await fund.accounting.methods
    .performCalculations()
    .call();

  const feeInDenominationAsset = new BN(postFundCalculations.feesInShares.toString())
    .mul(new BN(postFundCalculations.gav.toString()))
    .div(
      postTotalSupply.add(new BN(postFundCalculations.feesInShares.toString()))
    );

  const sharePriceUsingNav = BNExpDiv(
    new BN(postFundCalculations.nav.toString()),
    postTotalSupply,
  );

  const sharePriceUsingGav = BNExpDiv(
    new BN(postFundCalculations.gav.toString()).sub(feeInDenominationAsset),
    postTotalSupply,
  );

  expect(postTotalSupply).toEqualBN(preTotalSupply);
  expect(Number(postFundCalculations.sharePrice)).toBeGreaterThan(
    Number(preFundCalculations.sharePrice),
  );
  expect(postFundCalculations.sharePrice.toString()).toBe(`${sharePriceUsingGav}`);
  expect(postFundCalculations.sharePrice.toString()).toBe(`${sharePriceUsingNav}`);
});

test(`performance fee is calculated correctly`, async () => {
  const lastHWM = await performanceFee.methods
    .highWaterMark(fund.feeManager.options.address)
    .call();
  const currentTotalSupply = new BN(
    (await fund.shares.methods.totalSupply().call()).toString()
  );
  const fundCalculations = await fund.accounting.methods
    .performCalculations()
    .call();
  const gavePerShare = BNExpDiv(
    new BN(fundCalculations.gav.toString()),
    currentTotalSupply,
  );
  const gainInSharePrice = gavePerShare.sub(new BN(lastHWM.toString()));

  const expectedPerformanceFee = BNExpMul(
    BNExpMul(
      gainInSharePrice,
      new BN(performanceFeeRate.toString()),
    ),
    currentTotalSupply,
  );

  const expectedFeeSharesPreDilution = currentTotalSupply
    .mul(expectedPerformanceFee)
    .div(new BN(fundCalculations.gav.toString()));

  const expectedFeeShares = currentTotalSupply
    .mul(expectedFeeSharesPreDilution)
    .div(
      currentTotalSupply.sub(expectedFeeSharesPreDilution),
    );

  expect(fundCalculations.feesInShares.toString()).toBe(`${expectedFeeShares}`);
  expect(Number(fundCalculations.feesInDenominationAsset)).toBeCloseTo(
    Number(expectedPerformanceFee),
  );
});

test(`investor redeems half his shares, performance fee deducted`, async () => {
  const currentTotalSupply = new BN(
    (await fund.shares.methods.totalSupply().call()).toString()
  );
  const preManagerShares = new BN(
    (await fund.shares.methods.balanceOf(manager).call()).toString()
  );
  const pre = await getAllBalances(contracts, accounts, fund);
  const fundCalculations = await fund.accounting.methods
    .performCalculations()
    .call();
  const redeemingQuantity = wantedShares.div(new BN(2));
  await fund.participation.methods
    .redeemQuantity(`${redeemingQuantity}`)
    .send(investorTxOpts);
  const postManagerShares = new BN(
    (await fund.shares.methods.balanceOf(manager).call()).toString()
  );

  const redeemSharesProportion = BNExpDiv(redeemingQuantity, currentTotalSupply);
  const redeemSharesProportionAccountingInflation = BNExpDiv(
    redeemingQuantity,
    currentTotalSupply.add(new BN(fundCalculations.feesInShares.toString())),
  );
  const expectedOwedPerformanceFee = BNExpMul(
    redeemSharesProportionAccountingInflation,
    new BN(fundCalculations.feesInShares.toString()),
  );
  expect(postManagerShares.sub(preManagerShares))
    .toEqualBN(expectedOwedPerformanceFee);

  await fund.participation.methods
    .redeem()
    .send(managerTxOpts);
  const post = await getAllBalances(contracts, accounts, fund);

  expect(Number(post.manager.weth.sub(pre.manager.weth)))
    .toBeCloseTo(
      Number(
        BNExpMul(
          new BN(fundCalculations.feesInDenominationAsset.toString()),
          redeemSharesProportion,
        ),
      ),
    );
});

test(`manager calls rewardAllFees to update high watermark`, async () => {
  await increaseTime(Number(performanceFeePeriod));
  const preManagerShares = new BN(
    (await fund.shares.methods.balanceOf(manager).call()).toString()
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
    (await fund.shares.methods.balanceOf(manager).call()).toString()
  );
  const postFundCalculations = await fund.accounting.methods
    .performCalculations()
    .call();

  expect(postManagerShares.sub(preManagerShares).toString()).toBe(
    preFundCalculations.feesInShares.toString()
  );
  expect(postFundCalculations.sharePrice.toString()).toBe(
    preFundCalculations.sharePrice.toString(),
  );
  expect(currentHWM.toString()).toBe(preFundCalculations.gavPerShareNetManagementFee.toString());
  expect(postFundCalculations.gav.toString()).toBe(preFundCalculations.gav.toString());
  // expect(new BigInteger(fundCalculations.feesInDenominationAsset)).toEqual(
    // expectedPerformanceFee,
  // );
});
