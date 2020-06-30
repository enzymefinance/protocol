/*
 * @file Tests how setting a managementFee affects a fund
 *
 * @test The rewardManagementFee function distributes management fee shares to the manager
 * @test The triggerRewardAllFees function distributes all fee shares to the manager
 * @test An investor can still redeem their shares for the expected value
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { BNExpMul } from '~/utils/BNmath';
import { CONTRACT_NAMES } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import { delay } from '~/utils/time';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

const yearInSeconds = new BN(31536000);
let web3;
let deployer, manager, investor;
let defaultTxOpts, managerTxOpts, investorTxOpts;
let managementFeeRate;
let managementFee, mln, weth, fund;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  managementFee = getDeployed(CONTRACT_NAMES.MANAGEMENT_FEE, web3);
  const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);

  const managementFeePeriod = 0;
  managementFeeRate = toWei('0.02', 'ether');

  fund = await setupFundWithParams({
    fees: {
      addresses: [managementFee.options.address],
      rates: [managementFeeRate],
      periods: [managementFeePeriod],
    },
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory,
    web3
  });
});

test('executing rewardManagementFee distributes management fee shares to manager', async () => {
  const { feeManager, shares, vault } = fund;

  const fundCreationTime = new BN(
    await call(
      managementFee,
      'lastPayoutTime',
      [feeManager.options.address]
    )
  );

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundHoldingsWeth = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  );
  const preWethManager = new BN(await call(weth, 'balanceOf', [manager]));
  const preManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  const preTotalSupply = new BN(await call(shares, 'totalSupply'));
  const preFundGav = new BN(await call(shares, 'calcGav'));

  // Delay 1 sec to ensure block new blocktime
  await delay(1000);

  await send(feeManager, 'rewardManagementFee', [], managerTxOpts, web3);

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postFundHoldingsWeth = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  ); 
  const postWethManager = new BN(await call(weth, 'balanceOf', [manager]));
  const postManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  const postTotalSupply = new BN(await call(shares, 'totalSupply'));
  const postFundGav = new BN(await call(shares, 'calcGav'));

  const payoutTime = new BN(
    await call(managementFee, 'lastPayoutTime', [feeManager.options.address])
  );
  const expectedPreDilutionFeeShares = BNExpMul(preTotalSupply, new BN(managementFeeRate))
    .mul(payoutTime.sub(fundCreationTime))
    .div(yearInSeconds);

  const expectedFeeShares = preTotalSupply.mul(expectedPreDilutionFeeShares)
    .div(preTotalSupply.sub(expectedPreDilutionFeeShares));

  const fundHoldingsWethDiff = preFundHoldingsWeth.sub(postFundHoldingsWeth);

  // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal 
  expect(fundHoldingsWethDiff).bigNumberEq(preFundBalanceOfWeth.sub(postFundBalanceOfWeth));
  
  expect(fundHoldingsWethDiff).bigNumberEq(new BN(0));
  expect(postManagerShares).not.bigNumberEq(preManagerShares);
  expect(postManagerShares).bigNumberEq(preManagerShares.add(expectedFeeShares));
  expect(postTotalSupply).bigNumberEq(preTotalSupply.add(expectedFeeShares));
  expect(postFundGav).bigNumberEq(preFundGav);
  expect(postWethManager).bigNumberEq(preWethManager);
});

test('executing rewardAllFees distributes fee shares to manager', async () => {
  const { feeManager, shares, vault } = fund;

  const lastFeeConversion = new BN(
    await call(managementFee, 'lastPayoutTime', [feeManager.options.address])
  );
  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundHoldingsWeth = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  );
  const preWethManager = new BN(await call(weth, 'balanceOf', [manager]));
  const preManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  const preTotalSupply = new BN(await call(shares, 'totalSupply'));
  const preFundGav = new BN(await call(shares, 'calcGav'));

  // Delay 1 sec to ensure block new blocktime
  await delay(3000);

  await send(feeManager, 'rewardAllFees', [], managerTxOpts, web3);

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postFundHoldingsWeth = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  );
  const postWethManager = new BN(await call(weth, 'balanceOf', [manager]));
  const postManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  const postTotalSupply = new BN(await call(shares, 'totalSupply'));
  const postFundGav = new BN(await call(shares, 'calcGav'));

  const payoutTime = new BN(
    await call(managementFee, 'lastPayoutTime', [feeManager.options.address])
  );

  const expectedPreDilutionFeeShares = BNExpMul(preTotalSupply, new BN(managementFeeRate))
    .mul(payoutTime.sub(lastFeeConversion))
    .div(yearInSeconds);
  const expectedFeeShares = preTotalSupply.mul(expectedPreDilutionFeeShares)
    .div(preTotalSupply.sub(expectedPreDilutionFeeShares));

  const fundHoldingsWethDiff = preFundHoldingsWeth.sub(postFundHoldingsWeth);

  // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal 
  expect(fundHoldingsWethDiff).bigNumberEq(preFundBalanceOfWeth.sub(postFundBalanceOfWeth));

  expect(fundHoldingsWethDiff).bigNumberEq(new BN(0));
  expect(postManagerShares).bigNumberEq(preManagerShares.add(expectedFeeShares));
  expect(postTotalSupply).bigNumberEq(preTotalSupply.add(expectedFeeShares));
  expect(postFundGav).bigNumberEq(preFundGav);
  expect(postWethManager).bigNumberEq(preWethManager);
});

test('Investor redeems his shares', async () => {
  const { feeManager, shares, vault } = fund;

  const lastFeeConversion = new BN(
    await call(managementFee, 'lastPayoutTime', [feeManager.options.address])
  );

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundHoldingsWeth = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  );
  const preWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));
  const preTotalSupply = new BN(await call(shares, 'totalSupply'));
  const preInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));

  // Delay 1 sec to ensure block new blocktime
  await delay(1000);

  await send(shares, 'redeemShares', [], investorTxOpts, web3);

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postFundHoldingsWeth = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  );
  const postWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));
  const postTotalSupply = new BN(await call(shares, 'totalSupply'));
  const postFundGav = new BN(await call(shares, 'calcGav'));

  const payoutTime = new BN(
    await call(managementFee, 'lastPayoutTime', [feeManager.options.address])
  );

  const expectedPreDilutionFeeShares = BNExpMul(preTotalSupply, new BN(managementFeeRate))
    .mul(payoutTime.sub(lastFeeConversion))
    .div(yearInSeconds);
  const expectedFeeShares = preTotalSupply.mul(expectedPreDilutionFeeShares)
    .div(preTotalSupply.sub(expectedPreDilutionFeeShares));

  const fundHoldingsWethDiff = preFundHoldingsWeth.sub(postFundHoldingsWeth);

  // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal 
  expect(fundHoldingsWethDiff).bigNumberEq(preFundBalanceOfWeth.sub(postFundBalanceOfWeth));

  expect(fundHoldingsWethDiff).bigNumberEq(postWethInvestor.sub(preWethInvestor));
  expect(postTotalSupply).bigNumberEq(
    preTotalSupply.sub(preInvestorShares).add(expectedFeeShares)
  );
  expect(postWethInvestor).bigNumberEq(
    preFundHoldingsWeth.mul(preInvestorShares)
      .div(preTotalSupply.add(expectedFeeShares))
      .add(preWethInvestor)
  );
  expect(postFundGav).bigNumberEq(postFundHoldingsWeth);
});

test('Manager redeems his shares', async () => {
  const { shares } = fund;

  const preManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  expect(preManagerShares).not.bigNumberEq(new BN(0));

  // Delay 1 sec to ensure block new blocktime
  await delay(1000);

  await send(shares, 'redeemShares', [], managerTxOpts, web3);

  const postManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
  expect(postManagerShares).bigNumberEq(new BN(0));
});
