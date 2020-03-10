/*
 * @file Tests how setting a performanceFee affects a fund
 *
 * @test Sending weth to a fund's Vault artificially does NOT increase share price
 * @test Performance fee is calculated correctly
 * @test Performance fee is deducted when an investor redeems shares
 * @test Executing rewardAllFees updates the "high water mark" for performance fees
 */

import { toWei, BN } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { BNExpDiv, BNExpMul } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { getEventFromLogs, getFunctionSignature } from '~/tests/utils/metadata';
import { delay } from '~/tests/utils/time';

let defaultTxOpts, investorTxOpts, managerTxOpts;
let deployer, manager, investor;
let contracts;
let performanceFeePeriod, performanceFeeRate;
let mln, weth, oasisDexExchange, performanceFee, priceSource;
let fund;
let mlnToEthRate, wethToEthRate;
let exchangeIndex, takeOrderSignature;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  const deployed = await partialRedeploy(CONTRACT_NAMES.FUND_FACTORY);
  contracts = deployed.contracts;

  mln = contracts.MLN;
  weth = contracts.WETH;
  oasisDexExchange = contracts.OasisDexExchange;
  performanceFee = contracts.PerformanceFee;
  priceSource = contracts.TestingPriceFeed;

  const managementFee = contracts.ManagementFee;
  const oasisDexAdapter = contracts.OasisDexAdapter;
  const registry = contracts.Registry;
  const fundFactory = contracts.FundFactory;

  const feeAddresses = [
    managementFee.options.address,
    performanceFee.options.address
  ];
  performanceFeePeriod = '2'; // 2 secs
  performanceFeeRate = toWei('.2', 'ether');

  await send(registry, 'registerFees', [feeAddresses], defaultTxOpts);

  wethToEthRate = toWei('1', 'ether');
  mlnToEthRate = toWei('0.5', 'ether');
  await send(
    priceSource,
    'update',
    [
      [weth.options.address, mln.options.address],
      [wethToEthRate, mlnToEthRate],
    ],
    defaultTxOpts
  );

  fund = await setupFundWithParams({
    defaultTokens: [mln.options.address, weth.options.address],
    exchanges: [oasisDexExchange.options.address],
    exchangeAdapters: [oasisDexAdapter.options.address],
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
    fundFactory
  });
  exchangeIndex = 0;

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder'
  );
});

test(`fund gets weth from (non-initial) investor`, async () => {
  const { accounting, hub, shares } = fund;

  const contribAmount = toWei('1', 'ether');
  const shareCost = new BN(
    await call(
      accounting,
      'getShareCostInAsset',
      [toWei('1', 'ether'), weth.options.address]
    )
  );
  const wantedShares = BNExpDiv(new BN(contribAmount), shareCost);

  const preTotalSupply = new BN(await call(shares, 'totalSupply'));

  await investInFund({
    fundAddress: hub.options.address,
    investment: {
      contribAmount,
      investor,
      tokenContract: weth
    },
    tokenPriceData: {
      priceSource,
      tokenAddresses: [weth.options.address, mln.options.address],
      tokenPrices: [wethToEthRate, mlnToEthRate]
    }
  });

  const postTotalSupply = new BN(await call(shares, 'totalSupply'));
  expect(postTotalSupply).bigNumberEq(preTotalSupply.add(new BN(wantedShares)));
});

test(`can NOT artificially inflate share price by transfering weth to Vault`, async () => {
  const { accounting, shares, vault } = fund;

  const inflationAmount = toWei('0.1', 'ether');

  const preTotalSupply = new BN(await call(shares, 'totalSupply'));
  const preFundCalcs = await call(accounting, 'calcFundMetrics');

  await send(weth, 'transfer', [vault.options.address, inflationAmount], defaultTxOpts);

  const postTotalSupply = new BN(await call(shares, 'totalSupply'));
  const postFundCalcs = await call(accounting, 'calcFundMetrics');

  const feeInDenominationAsset =
    new BN(postFundCalcs.feesInShares_)
      .mul(new BN(postFundCalcs.gav_))
      .div(postTotalSupply.add(new BN(postFundCalcs.feesInShares_)));

  const sharePriceUsingNav = BNExpDiv(
    new BN(postFundCalcs.nav_),
    postTotalSupply,
  );

  const sharePriceUsingGav = BNExpDiv(
    new BN(postFundCalcs.gav_).sub(feeInDenominationAsset),
    postTotalSupply,
  );

  expect(postTotalSupply).bigNumberEq(preTotalSupply);
  expect(new BN(postFundCalcs.sharePrice_)).bigNumberEq(new BN(preFundCalcs.sharePrice_));
  expect(new BN(postFundCalcs.sharePrice_)).bigNumberEq(sharePriceUsingGav);
  expect(new BN(postFundCalcs.sharePrice_)).bigNumberEq(sharePriceUsingNav);
});

test(`performance fee is calculated correctly`, async () => {
  const { accounting, feeManager, shares } = fund;

  const lastHWM = new BN(
    await call(performanceFee, 'highWaterMark', [feeManager.options.address])
  );
  const currentTotalSupply = new BN(await call(shares, 'totalSupply'));
  const fundCalculations = await call(accounting, 'calcFundMetrics');
  const gavPerShare = BNExpDiv(
    new BN(fundCalculations.gav_),
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
    .div(new BN(fundCalculations.gav_));

  const expectedFeeShares = currentTotalSupply
    .mul(expectedFeeSharesPreDilution)
    .div(currentTotalSupply.sub(expectedFeeSharesPreDilution));

  expect(new BN(fundCalculations.feesInShares_)).bigNumberEq(expectedFeeShares);
  expect(new BN(fundCalculations.feesInDenominationAsset_))
    .bigNumberCloseTo(expectedPerformanceFee);
});

// @dev To inflate performance fee, take a trade, then update the pricefeed with a more favorable price.
test('take a trade for MLN on OasisDex, and artificially raise price of MLN/ETH', async () => {
  const { accounting, vault } = fund;

  const makerAsset = mln.options.address;
  const makerQuantity = toWei('0.1', 'ether');
  const takerAsset = weth.options.address;

  const makerToWethAssetRate = new BN(
    (await call(priceSource, 'getPrice', [makerAsset]))[0]
  );
  const takerQuantity = BNExpMul(
    new BN(makerQuantity),
    makerToWethAssetRate
  ).toString();

  // Third party makes an order
  await send(mln, 'approve', [oasisDexExchange.options.address, makerQuantity], defaultTxOpts);
  const res = await send(
    oasisDexExchange,
    'offer',
    [
      makerQuantity, makerAsset, takerQuantity, takerAsset, 0
    ],
    defaultTxOpts
  );

  const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
  const orderId = logMake.id;

  // Fund takes the trade
  await send(
    vault,
    'callOnExchange',
    [
      exchangeIndex,
      takeOrderSignature,
      [
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        makerAsset,
        takerAsset,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
      ],
      [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
      ['0x0', '0x0', '0x0', '0x0'],
      orderId,
      '0x0',
    ],
    managerTxOpts
  );

  // Update prices with higher MLN/WETH price
  const preMlnGav = new BN(await call(accounting, 'calcAssetGav', [mln.options.address]));
  const newMlnToEthRate = toWei('0.75', 'ether');
  await send(
    priceSource,
    'update',
    [
      [weth.options.address, mln.options.address],
      [wethToEthRate, newMlnToEthRate],
    ],
    defaultTxOpts
  );
  const postMlnGav = new BN(await call(accounting, 'calcAssetGav', [mln.options.address]));
  expect(postMlnGav).bigNumberGt(preMlnGav);
});


test(`investor redeems half his shares, performance fee deducted`, async () => {
  const { accounting, shares } = fund;

  const preInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));
  const preManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  const preFundCalcs = await call(accounting, 'calcFundMetrics');
  const preTotalSupply = new BN(await call(shares, 'totalSupply'));
  const preMlnManager = new BN(await call(mln, 'balanceOf', [manager]));
  const preWethManager = new BN(await call(weth, 'balanceOf', [manager]));

  const redeemQuantity = preInvestorShares.div(new BN(2));

  await send(shares, 'redeemSharesQuantity', [redeemQuantity.toString()], investorTxOpts);
  const postManagerShares = new BN(await call(shares, 'balanceOf', [manager]));

  const redeemSharesProportion = BNExpDiv(redeemQuantity, preTotalSupply);
  const redeemSharesProportionAccountingInflation = BNExpDiv(
    redeemQuantity,
    preTotalSupply.add(new BN(preFundCalcs.feesInShares_))
  );
  const expectedOwedPerformanceFee = BNExpMul(
    redeemSharesProportionAccountingInflation,
    new BN(preFundCalcs.feesInShares_)
  );

  expect(postManagerShares.sub(preManagerShares))
    .bigNumberEq(expectedOwedPerformanceFee);

  // Fund manager redeems his shares
  await send(shares, 'redeemShares', [], managerTxOpts);

  const finalMlnManager = new BN(await call(mln, 'balanceOf', [manager]));
  const finalWethManager = new BN(await call(weth, 'balanceOf', [manager]));
  
  // Get mln value in weth
  const redeemedMlnFees = finalMlnManager.sub(preMlnManager);
  const redeemedWethFees = finalWethManager.sub(preWethManager);

  const mlnToWethPrice = new BN(
    (await call(priceSource, 'getPrice', [mln.options.address]))[0]
  );
  const redeemedMlnFeesInWeth = BNExpMul(redeemedMlnFees, mlnToWethPrice);
  const estimatedRedeemedFeesInWeth = redeemedWethFees.add(redeemedMlnFeesInWeth);

  expect(estimatedRedeemedFeesInWeth).bigNumberCloseTo(
    BNExpMul(
      new BN(preFundCalcs.feesInDenominationAsset_),
      redeemSharesProportion
    )
  );
});

test(`manager calls triggerRewardAllFees to update high watermark`, async () => {
  const { accounting, feeManager, shares } = fund;

  const preManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  const preFundCalcs = await call(accounting, 'calcFundMetrics');

  // Wait for performance period
  await delay(2000);
  await send(accounting, 'triggerRewardAllFees', [], managerTxOpts);

  const postManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  const postFundCalcs = await call(accounting, 'calcFundMetrics');
  const currentHWM = new BN(
    await call(performanceFee, 'highWaterMark', [feeManager.options.address])
  );

  expect(postManagerShares.sub(preManagerShares)).bigNumberEq(
    new BN(preFundCalcs.feesInShares_)
  );
  expect(new BN(postFundCalcs.sharePrice_)).bigNumberEq(new BN(preFundCalcs.sharePrice_));
  expect(currentHWM).bigNumberEq(new BN(preFundCalcs.gavPerShareNetManagementFee_));
  expect(new BN(postFundCalcs.gav_)).bigNumberEq(new BN(preFundCalcs.gav_));
});
