/*
 * @file Tests how setting a performanceFee affects a fund
 *
 * @test Sending weth to a fund's vault artificially increases the share price
 * @test Performance fee is calculated correctly
 * @test Performance fee is deducted when an investor redeems shares
 * @test Executing rewardAllFees updates the "high water mark" for performance fees
 */

import { toWei, BN } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { BNExpDiv, BNExpMul } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { delay } from '~/tests/utils/time';
import updateTestingPriceFeed from '~/tests/utils/updateTestingPriceFeed';

let defaultTxOpts, investorTxOpts, managerTxOpts;
let deployer, manager, investor;
let contracts, deployOut;
let performanceFeePeriod, performanceFeeRate;
let mln, weth, performanceFee, fund;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  const deployed = await partialRedeploy(CONTRACT_NAMES.VERSION);
  contracts = deployed.contracts;
  deployOut = deployed.deployOut;

  mln = contracts.MLN;
  weth = contracts.WETH;
  performanceFee = contracts.PerformanceFee;

  const managementFee = contracts.ManagementFee;
  const registry = contracts.Registry;
  const version = contracts.Version;

  const feeAddresses = [
    managementFee.options.address,
    performanceFee.options.address
  ];
  performanceFeePeriod = '2'; // 2 secs
  performanceFeeRate = toWei('.2', 'ether');

  await send(registry, 'registerFees', [feeAddresses], defaultTxOpts);

  fund = await setupFundWithParams({
    defaultTokens: [mln.options.address, weth.options.address],
    fees: {
      addresses: feeAddresses,
      rates: [0, performanceFeeRate],
      periods: [0, performanceFeePeriod],
    },
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor: deployer, // invest from deployer so manager and investor calcs are simpler
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    version
  });
});

test(`fund gets weth from (non-initial) investor`, async () => {
  const { accounting, participation, shares } = fund;

  const amguAmount = toWei('.01', 'ether');
  const shareSlippageTolerance = new BN(toWei('0.0001', 'ether')); // 0.01%

  const offerAsset = weth.options.address;
  const wantedShares = toWei('1', 'ether');

  const expectedOfferAssetCost = new BN(
    await call(
      accounting,
      'getShareCostInAsset',
      [wantedShares, offerAsset]
    )
  );
  const offerAssetAmount = BNExpMul(
    expectedOfferAssetCost,
    new BN(toWei('1', 'ether')).add(shareSlippageTolerance)
  ).toString();

  await send(weth, 'transfer', [investor, offerAssetAmount], defaultTxOpts);

  const preTotalSupply = new BN(await call(shares, 'totalSupply'));

  await send(
    weth,
    'approve',
    [participation.options.address, offerAssetAmount],
    investorTxOpts
  );
  await send(
    participation,
    'requestInvestment',
    [wantedShares, offerAssetAmount, offerAsset],
    { ...investorTxOpts, value: amguAmount }
  );

  // Need price update before participation executed
  await delay(1000);
  await updateTestingPriceFeed(contracts.TestingPriceFeed, Object.values(deployOut.tokens.addr));

  await send(
    participation,
    'executeRequestFor',
    [investor],
    investorTxOpts
  );

  const postTotalSupply = new BN(await call(shares, 'totalSupply'));
  expect(postTotalSupply).bigNumberEq(preTotalSupply.add(new BN(wantedShares)));
});

/*
 * @dev This will no longer work once we use storage for accounting rather than balances.
 * The proper way to do this is probably by making a trade and then updating the pricefeed
 * with more favorable prices.
 */
test(`artificially inflate share price by transfering weth to vault`, async () => {
  const { accounting, shares, vault } = fund;

  const inflationAmount = toWei('0.1', 'ether');

  const preTotalSupply = new BN(await call(shares, 'totalSupply'));
  const preFundCalcs = await call(accounting, 'performCalculations');

  await send(weth, 'transfer', [vault.options.address, inflationAmount], defaultTxOpts);

  const postTotalSupply = new BN(await call(shares, 'totalSupply'));
  const postFundCalcs = await call(accounting, 'performCalculations');

  const feeInDenominationAsset =
    new BN(postFundCalcs.feesInShares)
      .mul(new BN(postFundCalcs.gav))
      .div(postTotalSupply.add(new BN(postFundCalcs.feesInShares)));

  const sharePriceUsingNav = BNExpDiv(
    new BN(postFundCalcs.nav),
    postTotalSupply,
  );

  const sharePriceUsingGav = BNExpDiv(
    new BN(postFundCalcs.gav).sub(feeInDenominationAsset),
    postTotalSupply,
  );

  expect(postTotalSupply).bigNumberEq(preTotalSupply);
  expect(new BN(postFundCalcs.sharePrice)).bigNumberGt(new BN(preFundCalcs.sharePrice));
  expect(new BN(postFundCalcs.sharePrice)).bigNumberEq(sharePriceUsingGav);
  expect(new BN(postFundCalcs.sharePrice)).bigNumberEq(sharePriceUsingNav);
});

test(`performance fee is calculated correctly`, async () => {
  const { accounting, feeManager, shares } = fund;

  const lastHWM = new BN(
    await call(performanceFee, 'highWaterMark', [feeManager.options.address])
  );
  const currentTotalSupply = new BN(await call(shares, 'totalSupply'));
  const fundCalculations = await call(accounting, 'performCalculations');
  const gavPerShare = BNExpDiv(
    new BN(fundCalculations.gav),
    currentTotalSupply,
  );
  const gainInSharePrice = gavPerShare.sub(new BN(lastHWM));

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
    .div(currentTotalSupply.sub(expectedFeeSharesPreDilution));

  expect(new BN(fundCalculations.feesInShares)).bigNumberEq(expectedFeeShares);
  expect(new BN(fundCalculations.feesInDenominationAsset))
    .bigNumberCloseTo(expectedPerformanceFee);
});

test('investor redeems half his shares, performance fee deducted', async () => {
  const { accounting, participation, shares } = fund;

  const preInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));
  const preManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  const preFundCalcs = await call(accounting, 'performCalculations');
  const preTotalSupply = new BN(await call(shares, 'totalSupply'));
  const preWethManager = new BN(await call(weth, 'balanceOf', [manager]));

  const redeemQuantity = preInvestorShares.div(new BN(2));

  await send(participation, 'redeemQuantity', [redeemQuantity.toString()], investorTxOpts);

  const postManagerShares = new BN(await call(shares, 'balanceOf', [manager]));

  const redeemSharesProportion = BNExpDiv(redeemQuantity, preTotalSupply);
  const redeemSharesProportionAccountingInflation = BNExpDiv(
    redeemQuantity,
    preTotalSupply.add(new BN(preFundCalcs.feesInShares))
  );
  const expectedOwedPerformanceFee = BNExpMul(
    redeemSharesProportionAccountingInflation,
    new BN(preFundCalcs.feesInShares)
  );

  expect(postManagerShares.sub(preManagerShares))
    .bigNumberEq(expectedOwedPerformanceFee);

  // Fund manager redeems his shares
  await send(participation, 'redeem', [], managerTxOpts);
  const finalWethManager = new BN(await call(weth, 'balanceOf', [manager]));
  expect(finalWethManager.sub(preWethManager)).bigNumberCloseTo(
    BNExpMul(
      new BN(preFundCalcs.feesInDenominationAsset),
      redeemSharesProportion
    )
  );
});

test(`manager calls triggerRewardAllFees to update high watermark`, async () => {
  const { accounting, feeManager, shares } = fund;

  const preManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  const preFundCalcs = await call(accounting, 'performCalculations');

  // Wait for performance period
  await delay(2000);
  await send(accounting, 'triggerRewardAllFees', [], managerTxOpts);

  const postManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  const postFundCalcs = await call(accounting, 'performCalculations');
  const currentHWM = new BN(
    await call(performanceFee, 'highWaterMark', [feeManager.options.address])
  );

  expect(postManagerShares.sub(preManagerShares)).bigNumberEq(
    new BN(preFundCalcs.feesInShares)
  );
  expect(new BN(postFundCalcs.sharePrice)).bigNumberEq(new BN(preFundCalcs.sharePrice));
  expect(currentHWM).bigNumberEq(new BN(preFundCalcs.gavPerShareNetManagementFee));
  expect(new BN(postFundCalcs.gav)).bigNumberEq(new BN(preFundCalcs.gav));
});
