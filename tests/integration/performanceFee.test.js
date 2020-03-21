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
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { getEventFromLogs, getFunctionSignature } from '~/tests/utils/metadata';
import { delay } from '~/tests/utils/time';
import { encodeOasisDexTakeOrderArgs } from '~/tests/utils/oasisDex';

let defaultTxOpts, investorTxOpts, managerTxOpts;
let deployer, manager, investor;
let contracts;
let performanceFeePeriod, performanceFeeRate;
let mln, weth, oasisDexAdapter, oasisDexExchange, performanceFee, priceSource;
let fund;
let mlnToEthRate, wethToEthRate;
let takeOrderSignature;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  const deployed = await partialRedeploy(CONTRACT_NAMES.FUND_FACTORY);
  contracts = deployed.contracts;

  mln = contracts.MLN;
  weth = contracts.WETH;
  oasisDexAdapter = contracts.OasisDexAdapter;
  oasisDexExchange = contracts.OasisDexExchange;
  performanceFee = contracts.PerformanceFee;
  priceSource = contracts.TestingPriceFeed;

  const managementFee = contracts.ManagementFee;
  const fundFactory = contracts.FundFactory;

  const feeAddresses = [
    managementFee.options.address,
    performanceFee.options.address
  ];
  performanceFeePeriod = '2'; // 2 secs
  performanceFeeRate = toWei('.2', 'ether');

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
    integrationAdapters: [oasisDexAdapter.options.address],
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

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder'
  );
});

test(`fund gets weth from (non-initial) investor`, async () => {
  const { hub, shares } = fund;

  const contribAmount = toWei('1', 'ether');
  const shareCost = new BN(
    await call(
      shares,
      'getSharesCostInAsset',
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
  const { shares, vault } = fund;

  const inflationAmount = toWei('0.1', 'ether');

  const preTotalSupply = new BN(await call(shares, 'totalSupply'));
  const preFundGav = new BN(await call(shares, 'calcGav'));
  const preFundSharePrice = new BN(
    await call(shares, 'getSharesCostInAsset', [toWei('1', 'ether'), weth.options.address])
  );

  await send(weth, 'transfer', [vault.options.address, inflationAmount], defaultTxOpts);

  const postTotalSupply = new BN(await call(shares, 'totalSupply'));
  const postFundGav = new BN(await call(shares, 'calcGav'));
  const postFundSharePrice = new BN(
    await call(shares, 'getSharesCostInAsset', [toWei('1', 'ether'), weth.options.address])
  );
  expect(postTotalSupply).bigNumberEq(preTotalSupply);
  expect(postFundSharePrice).bigNumberEq(preFundSharePrice);
  expect(postFundGav).bigNumberEq(preFundGav);
});

// @dev To inflate performance fee, take a trade, then update the pricefeed with a more favorable price.
test('take a trade for MLN on OasisDex, and artificially raise price of MLN/ETH', async () => {
  const { vault } = fund;

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

  const encodedArgs = encodeOasisDexTakeOrderArgs({
    makerAsset,
    makerQuantity,
    takerAsset,
    takerQuantity,
    orderId,
  });

  await send(
    vault,
    'callOnIntegration',
    [
      oasisDexAdapter.options.address,
      takeOrderSignature,
      encodedArgs,
    ],
    managerTxOpts,
  );

  // Update prices with higher MLN/WETH price
  const preMlnGav = BNExpMul(
    new BN(await call(vault, 'assetBalances', [mln.options.address])),
    new BN((await call(priceSource, 'getPrice', [mln.options.address]))[0])
  );
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
  const postMlnGav = BNExpMul(
    new BN(await call(vault, 'assetBalances', [mln.options.address])),
    new BN(newMlnToEthRate)
  );

  expect(postMlnGav).bigNumberGt(preMlnGav);
});

test(`performance fee is calculated correctly`, async () => {
  const { feeManager, shares } = fund;

  // Wait for performance period
  await delay(2000);

  const lastHWM = new BN(
    await call(performanceFee, 'highWaterMark', [feeManager.options.address])
  );
  const currentTotalSupply = new BN(await call(shares, 'totalSupply'));
  const fundGav = new BN(await call(shares, 'calcGav'));
  const gavPerShare = BNExpDiv(
    fundGav,
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

  const performanceFeeOwed = new BN(await call(feeManager, 'performanceFeeAmount'));
  expect(performanceFeeOwed).bigNumberGt(new BN(0));

  const newGavPerShare = BNExpDiv(
    fundGav,
    currentTotalSupply.add(performanceFeeOwed),
  );

  expect(expectedPerformanceFee).bigNumberCloseTo(
    BNExpMul(performanceFeeOwed, newGavPerShare)
  );

  const expectedFeeSharesPreDilution = currentTotalSupply.mul(expectedPerformanceFee).div(fundGav);
  const expectedFeeShares = currentTotalSupply
    .mul(expectedFeeSharesPreDilution)
    .div(currentTotalSupply.sub(expectedFeeSharesPreDilution));
  expect(performanceFeeOwed).bigNumberEq(expectedFeeShares);
});

test(`investor redeems half his shares, performance fee deducted`, async () => {
  const { feeManager, shares } = fund;

  const preInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));
  const preManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  const preTotalSupply = new BN(await call(shares, 'totalSupply'));

  const performanceFeeOwed = new BN(await call(feeManager, 'performanceFeeAmount'));
  expect(performanceFeeOwed).bigNumberGt(new BN(0));

  const redeemQuantity = preInvestorShares.div(new BN(2));

  await send(shares, 'redeemSharesQuantity', [redeemQuantity.toString()], investorTxOpts);
  
  const postInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));
  const postManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  const postTotalSupply = new BN(await call(shares, 'totalSupply'));

  expect(postInvestorShares).bigNumberEq(preInvestorShares.sub(redeemQuantity));
  expect(postManagerShares).bigNumberEq(preManagerShares.add(performanceFeeOwed));
  expect(postTotalSupply).bigNumberEq(preTotalSupply.add(performanceFeeOwed).sub(redeemQuantity));
});

// This test doesn't add coverage, but fine to leave it.
test(`manager redeems his shares and receives expected proportion of assets`, async () => {
  const { shares, vault } = fund;

  const preMlnFund = new BN(await call(vault, 'assetBalances', [mln.options.address]));
  const preMlnManager = new BN(await call(mln, 'balanceOf', [manager]));
  const preWethFund = new BN(await call(vault, 'assetBalances', [weth.options.address]));
  const preWethManager = new BN(await call(weth, 'balanceOf', [manager]));
  const preManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  const preTotalSupply = new BN(await call(shares, 'totalSupply'));

  await send(shares, 'redeemShares', [], managerTxOpts);

  const postMlnManager = new BN(await call(mln, 'balanceOf', [manager]));
  const postWethManager = new BN(await call(weth, 'balanceOf', [manager]));

  const redeemSharesProportion = BNExpDiv(preManagerShares, preTotalSupply);

  expect(postMlnManager.sub(preMlnManager)).bigNumberCloseTo(
    BNExpMul(preMlnFund, redeemSharesProportion)
  );
  expect(postWethManager.sub(preWethManager)).bigNumberCloseTo(
    BNExpMul(preWethFund, redeemSharesProportion)
  );
});

test(`manager calls rewardAllFees to update high watermark`, async () => {
  const { feeManager, shares, vault } = fund;

  // Wait for performance period
  await delay(2000);

  // Artificially inflate gav with a price update
  const preMlnGav = BNExpMul(
    new BN(await call(vault, 'assetBalances', [mln.options.address])),
    new BN((await call(priceSource, 'getPrice', [mln.options.address]))[0])
  );
  const newMlnToEthRate = toWei('1', 'ether');
  await send(
    priceSource,
    'update',
    [
      [weth.options.address, mln.options.address],
      [wethToEthRate, newMlnToEthRate],
    ],
    defaultTxOpts
  );
  const postMlnGav = BNExpMul(
    new BN(await call(vault, 'assetBalances', [mln.options.address])),
    new BN(newMlnToEthRate)
  );
  expect(postMlnGav).bigNumberGt(preMlnGav);

  const preManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  const preFundGav = new BN(await call(shares, 'calcGav'));
  const preFundSharePrice = new BN(
    await call(shares, 'getSharesCostInAsset', [toWei('1', 'ether'), weth.options.address])
  );
  const preTotalSupply = new BN(await call(shares, 'totalSupply'));

  const performanceFeeOwed = new BN(await call(feeManager, 'performanceFeeAmount'));
  expect(performanceFeeOwed).bigNumberGt(new BN(0));

  await send(feeManager, 'rewardAllFees', [], managerTxOpts);

  const postManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  const postFundGav = new BN(await call(shares, 'calcGav'));
  const postFundSharePrice = new BN(
    await call(shares, 'getSharesCostInAsset', [toWei('1', 'ether'), weth.options.address])
  );
  const postTotalSupply = new BN(await call(shares, 'totalSupply'));

  const preFundGavPerShare = BNExpDiv(preFundGav, preTotalSupply);
  const postFundGavPerShare = BNExpDiv(postFundGav, postTotalSupply);

  expect(postFundGav).bigNumberEq(preFundGav);
  expect(postManagerShares.sub(preManagerShares)).bigNumberEq(performanceFeeOwed);

  const currentHWM = new BN(
    await call(performanceFee, 'highWaterMark', [feeManager.options.address])
  );
  expect(currentHWM).bigNumberEq(preFundGavPerShare);
  expect(postFundGavPerShare).bigNumberCloseTo(
    BNExpMul(
      preFundGavPerShare,
      BNExpDiv(preTotalSupply, preTotalSupply.add(performanceFeeOwed))
    )
  );
});
