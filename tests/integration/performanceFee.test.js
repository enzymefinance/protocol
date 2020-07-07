/*
 * @file Tests how setting a performanceFee affects a fund
 *
 * @test Sending weth to a fund's Vault artificially does NOT increase share price
 * @test Performance fee is calculated correctly
 * @test Performance fee is deducted when an investor redeems shares
 * @test Executing rewardAllFees updates the "high water mark" for performance fees
 */

import { toWei, BN } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { BNExpDiv, BNExpMul } from '~/utils/BNmath';
import { CALL_ON_INTEGRATION_ENCODING_TYPES, CONTRACT_NAMES } from '~/utils/constants';
import { investInFund, setupFundWithParams } from '~/utils/fund';
import { getFunctionSignature } from '~/utils/metadata';
import { delay } from '~/utils/time';
import { encodeArgs } from '~/utils/formatting';
import { getDeployed } from '~/utils/getDeployed';
import { updateKyberPriceFeed, setKyberRate } from '~/utils/updateKyberPriceFeed';
import mainnetAddrs from '~/config';

let defaultTxOpts, investorTxOpts, managerTxOpts;
let deployer, manager, investor;
let performanceFeePeriod, performanceFeeRate;
let mln, weth;
let performanceFee, managementFee, priceSource;
let kyberAdapter;
let fund;
let mlnToEthRate, wethToEthRate;
let takeOrderSignature;

beforeAll(async () => {
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS,  mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH,  mainnetAddrs.tokens.WETH);
  kyberAdapter = getDeployed(CONTRACT_NAMES.KYBER_ADAPTER);
  managementFee = getDeployed(CONTRACT_NAMES.MANAGEMENT_FEE);
  performanceFee = getDeployed(CONTRACT_NAMES.PERFORMANCE_FEE);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED);
  const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);

  const feeAddresses = [
    managementFee.options.address,
    performanceFee.options.address
  ];
  performanceFeePeriod = '2'; // 2 secs
  performanceFeeRate = toWei('.2', 'ether');

  wethToEthRate = toWei('1', 'ether');
  mlnToEthRate = toWei('0.5', 'ether');

  fund = await setupFundWithParams({
    integrationAdapters: [kyberAdapter.options.address],
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
    CONTRACT_NAMES.KYBER_ADAPTER,
    'takeOrder'
  );
});

test(`fund gets weth from (non-initial) investor`, async () => {
  const { hub, shares } = fund;

  const contribAmount = toWei('1', 'ether');
  const sharePrice = new BN(await call(shares, 'calcSharePrice'));
  const expectedShares = BNExpDiv(new BN(contribAmount), sharePrice);

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
  expect(postTotalSupply).bigNumberEq(preTotalSupply.add(expectedShares));
});

// @dev To inflate performance fee, take a trade, then update the pricefeed with a more favorable price.
test('take a trade for MLN on Kyber, and artificially raise price of MLN/ETH', async () => {
  const { shares, vault } = fund;

  const encodedArgs = encodeArgs(
    CALL_ON_INTEGRATION_ENCODING_TYPES.KYBER.TAKE_ORDER,
    [
      mln.options.address, // incoming asset
      1, // min incoming asset amount
      weth.options.address, // outgoing asset,
      toWei('0.05', 'ether') // exact outgoing asset amount
    ]
  );

  await send(
    vault,
    'callOnIntegration',
    [
      kyberAdapter.options.address,
      takeOrderSignature,
      encodedArgs,
    ],
    managerTxOpts
  );

  // Update prices with higher MLN/WETH price
  const preFundGav = new BN(await call(shares, 'calcGav'));
  const preMlnGav = BNExpMul(
    new BN(await call(mln, 'balanceOf', [vault.options.address])),
    new BN((await call(priceSource, 'getCanonicalRate', [mln.options.address, weth.options.address]))[0])
  );
  const preWethGav = new BN(await call(weth, 'balanceOf', [vault.options.address]));

  const etherPerMln = new BN(toWei('1.5', 'ether'));
  await setKyberRate(mln.options.address,  etherPerMln);
  await updateKyberPriceFeed(priceSource);

  const mlnPricePostSwap = new BN(
    (await call(priceSource, 'getLiveRate', [mln.options.address, weth.options.address]))[0]
  );
  const postFundGav = new BN(await call(shares, 'calcGav'));
  const postMlnGav = BNExpMul(
    new BN(await call(mln, 'balanceOf', [vault.options.address])),
    mlnPricePostSwap
  );
  const postWethGav = new BN(await call(weth, 'balanceOf', [vault.options.address]));

  const mlnGavDiff = postMlnGav.sub(preMlnGav);
  const wethGavDiff = preWethGav.sub(postWethGav);

  // Fund gav should increase by change in mlnGav
  expect(postFundGav).bigNumberEq(preFundGav.add(mlnGavDiff).sub(wethGavDiff));
  // Mln gav should increase by rate change in mln: 50% increase
  expect(mlnGavDiff).bigNumberEq(preMlnGav.div(new BN(2)));
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
      currentTotalSupply,
    ),
    new BN(performanceFeeRate),
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
  const preFundGav = new BN(await call(shares, 'calcGav'));
  const preFundGavPerShare = BNExpDiv(preFundGav, preTotalSupply);

  const performanceFeeOwed = new BN(await call(feeManager, 'performanceFeeAmount'));
  expect(performanceFeeOwed).bigNumberGt(new BN(0));

  const redeemQuantity = preInvestorShares.div(new BN(2));
  await send(shares, 'redeemSharesQuantity', [redeemQuantity.toString()], investorTxOpts);

  const postHWM = new BN(await call(performanceFee, 'highWaterMark', [feeManager.options.address]));
  const postInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));
  const postManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  const postTotalSupply = new BN(await call(shares, 'totalSupply'));

  expect(postHWM).bigNumberEq(preFundGavPerShare);
  expect(postInvestorShares).bigNumberEq(preInvestorShares.sub(redeemQuantity));
  expect(postManagerShares).bigNumberEq(preManagerShares.add(performanceFeeOwed));
  expect(postTotalSupply).bigNumberEq(preTotalSupply.add(performanceFeeOwed).sub(redeemQuantity));
});

// This test doesn't add coverage, but fine to leave it.
test(`manager redeems his shares and receives expected proportion of assets`, async () => {
  const { shares, vault } = fund;

  const preMlnFund = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  const preMlnManager = new BN(await call(mln, 'balanceOf', [manager]));
  const preWethFund = new BN(await call(weth, 'balanceOf', [vault.options.address]));
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
    new BN(await call(mln, 'balanceOf', [vault.options.address])),
    new BN((await call(priceSource, 'getCanonicalRate', [mln.options.address, weth.options.address]))[0])
  );
  // Double Mln price
  const etherPerMln = new BN(toWei('2', 'ether'));
  await setKyberRate(mln.options.address,  etherPerMln);
  await updateKyberPriceFeed(priceSource);
  const postMlnGav = BNExpMul(
    new BN(await call(mln, 'balanceOf', [vault.options.address])),
    new BN(etherPerMln)
  );
  expect(postMlnGav).bigNumberGt(preMlnGav);

  const preManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  const preFundGav = new BN(await call(shares, 'calcGav'));
  const preTotalSupply = new BN(await call(shares, 'totalSupply'));

  const performanceFeeOwed = new BN(await call(feeManager, 'performanceFeeAmount'));
  expect(performanceFeeOwed).bigNumberGt(new BN(0));

  await send(feeManager, 'rewardAllFees', [], managerTxOpts);

  const postManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  const postFundGav = new BN(await call(shares, 'calcGav'));
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
