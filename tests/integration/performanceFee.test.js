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
import { BNExpDiv, BNExpMul } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import { getEventFromLogs, getFunctionSignature } from '~/tests/utils/metadata';
import { delay } from '~/tests/utils/time';
import { encodeOasisDexTakeOrderArgs } from '~/tests/utils/oasisDex';
import { getDeployed } from '~/tests/utils/getDeployed';
import { updateKyberPriceFeed } from '~/tests/utils/updateKyberPriceFeed';
import * as mainnetAddrs from '~/mainnet_thirdparty_contracts';

let web3;
let defaultTxOpts, investorTxOpts, managerTxOpts;
let deployer, manager, investor;
let performanceFeePeriod, performanceFeeRate;
let mln, weth, oasisDexAdapter, oasisDexExchange;
let performanceFee, managementFee, priceSource;
let fund;
let mlnToEthRate, wethToEthRate;
let takeOrderSignature;
let kyberProxy;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  oasisDexAdapter = getDeployed(CONTRACT_NAMES.OASIS_DEX_ADAPTER, web3);
  oasisDexExchange = getDeployed(CONTRACT_NAMES.OASIS_DEX_EXCHANGE, web3, mainnetAddrs.oasis.OasisDexExchange);
  managementFee = getDeployed(CONTRACT_NAMES.MANAGEMENT_FEE, web3);
  performanceFee = getDeployed(CONTRACT_NAMES.PERFORMANCE_FEE, web3);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);
  kyberProxy = getDeployed(CONTRACT_NAMES.KYBER_NETWORK_PROXY, web3, mainnetAddrs.kyber.KyberNetworkProxy);
  const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);

  const feeAddresses = [
    managementFee.options.address,
    performanceFee.options.address
  ];
  performanceFeePeriod = '2'; // 2 secs
  performanceFeeRate = toWei('.2', 'ether');

  wethToEthRate = toWei('1', 'ether');
  mlnToEthRate = toWei('0.5', 'ether');

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
    fundFactory,
    web3
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
    },
    web3
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

  await send(weth, 'transfer', [vault.options.address, inflationAmount], defaultTxOpts, web3);

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
  await send(mln, 'approve', [oasisDexExchange.options.address, makerQuantity], defaultTxOpts, web3);
  const res = await send(
    oasisDexExchange,
    'offer',
    [
      makerQuantity, makerAsset, takerQuantity, takerAsset, 0
    ],
    defaultTxOpts,
    web3
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
    web3
  );

  const mlnPricePreSwap = new BN(
    (await call(priceSource, 'getPrice', [mln.options.address]))[0]
  );
  const preMlnGav = BNExpMul(
    new BN(await call(vault, 'assetBalances', [mln.options.address])),
    mlnPricePreSwap
  );

  // third party makes swap on kyber to influence MLN price
  await send(
    kyberProxy,
    'swapEtherToToken',
    [mln.options.address, '1'],
    {from: deployer, gas: 8000000, value: toWei('1', 'ether')},
    web3
  );
  await updateKyberPriceFeed(priceSource, web3);

  const mlnPricePostSwap = new BN(
    (await call(priceSource, 'getPrice', [mln.options.address]))[0]
  );
  const postMlnGav = BNExpMul(
    new BN(await call(vault, 'assetBalances', [mln.options.address])),
    mlnPricePostSwap
  );

  expect(mlnPricePostSwap).bigNumberGt(mlnPricePreSwap);
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
  // XXX: below not passing (off by one)
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

  await send(shares, 'redeemSharesQuantity', [redeemQuantity.toString()], investorTxOpts, web3);
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

  await send(shares, 'redeemShares', [], managerTxOpts, web3);

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
    kyberProxy,
    'swapEtherToToken',
    [mln.options.address, '1'],
    {from: deployer, value: toWei('100', 'ether')},
    web3
  );
  console.log(((await call(priceSource, 'getPrice', [mln.options.address]))[0]).toString())
  await updateKyberPriceFeed(priceSource, web3);
  console.log(((await call(priceSource, 'getPrice', [mln.options.address]))[0]).toString())
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

  await send(feeManager, 'rewardAllFees', [], managerTxOpts, web3);

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
