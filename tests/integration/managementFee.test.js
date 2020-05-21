/*
 * @file Tests how setting a managementFee affects a fund
 *
 * @test The rewardManagementFee function distributes management fee shares to the manager
 * @test The triggerRewardAllFees function distributes all fee shares to the manager
 * @test An investor can still redeem their shares for the expected value
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { BNExpMul, BNExpDiv } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import { delay } from '~/tests/utils/time';
const mainnetAddrs = require('../../mainnet_thirdparty_contracts');

let web3; // TODO: hoist to jest setup
const yearInSeconds = new BN(31536000);
let deployer, manager, investor;
let defaultTxOpts, managerTxOpts, investorTxOpts;
let contracts;
let managementFeeRate;
let managementFee, mln, weth, fund;

///////////////////////////////
import fs from 'fs';
import path from 'path';

const outDir = './out';
const getDeployed = (contractName, address, web3) => {
  const artifact = JSON.parse(
    fs.readFileSync(path.join(outDir, `${contractName}.json`))
  );
  return new web3.eth.Contract(artifact.abi, address);
}

// gets address from network 1 in the artifact
// that means that the contract is assumed to be deployed on that network
const getDeployedFromArtifact = (contractName, web3) => {
  const artifact = JSON.parse(
    fs.readFileSync(path.join(outDir, `${contractName}.json`))
  );
  return new web3.eth.Contract(artifact.abi, artifact.networks['1'].address);
}


///////////////////////////////

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };
  weth = getDeployed('WETH', mainnetAddrs.tokens.WETH, web3);
  mln = getDeployed('MLN', mainnetAddrs.tokens.MLN, web3);
  managementFee = getDeployedFromArtifact('ManagementFee', web3);
  const fundFactory = getDeployedFromArtifact('FundFactory', web3);
  const kyberPriceFeed = getDeployedFromArtifact('KyberPriceFeed', web3);
  await updateFeed(kyberPriceFeed, web3);

  // const deployed = await partialRedeploy(CONTRACT_NAMES.FUND_FACTORY);
  // contracts = deployed.contracts;

  // weth = contracts.WETH;
  // mln = contracts.MLN;
  // managementFee = contracts.ManagementFee;
  // const fundFactory = contracts.FundFactory;

  /////////////
  await send(weth, 'deposit', [], { value: toWei('10', 'ether') }, web3);
  await send(
    weth,
    'transfer',
    [investor, toWei('10', 'ether')],
    defaultTxOpts,
    web3
  )
  /////////////

  const managementFeePeriod = 0;
  managementFeeRate = toWei('0.02', 'ether');

  fund = await setupFundWithParams({
    defaultTokens: [mln.options.address, weth.options.address],
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

// test('executing rewardAllFees distributes fee shares to manager', async () => {
//   const { feeManager, shares, vault } = fund;

//   const lastFeeConversion = new BN(
//     await call(managementFee, 'lastPayoutTime', [feeManager.options.address])
//   );
//   const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
//   const preFundHoldingsWeth = new BN(
//     await call(vault, 'assetBalances', [weth.options.address])
//   );
//   const preWethManager = new BN(await call(weth, 'balanceOf', [manager]));
//   const preManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
//   const preTotalSupply = new BN(await call(shares, 'totalSupply'));
//   const preFundGav = new BN(await call(shares, 'calcGav'));

//   // Delay 1 sec to ensure block new blocktime
//   await delay(3000);

//   await send(feeManager, 'rewardAllFees', [], managerTxOpts);

//   const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
//   const postFundHoldingsWeth = new BN(
//     await call(vault, 'assetBalances', [weth.options.address])
//   );
//   const postWethManager = new BN(await call(weth, 'balanceOf', [manager]));
//   const postManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
//   const postTotalSupply = new BN(await call(shares, 'totalSupply'));
//   const postFundGav = new BN(await call(shares, 'calcGav'));

//   const payoutTime = new BN(
//     await call(managementFee, 'lastPayoutTime', [feeManager.options.address])
//   );

//   const expectedPreDilutionFeeShares = BNExpMul(preTotalSupply, new BN(managementFeeRate))
//     .mul(payoutTime.sub(lastFeeConversion))
//     .div(yearInSeconds);
//   const expectedFeeShares = preTotalSupply.mul(expectedPreDilutionFeeShares)
//     .div(preTotalSupply.sub(expectedPreDilutionFeeShares));

//   const fundHoldingsWethDiff = preFundHoldingsWeth.sub(postFundHoldingsWeth);

//   // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal 
//   expect(fundHoldingsWethDiff).bigNumberEq(preFundBalanceOfWeth.sub(postFundBalanceOfWeth));

//   expect(fundHoldingsWethDiff).bigNumberEq(new BN(0));
//   expect(postManagerShares).bigNumberEq(preManagerShares.add(expectedFeeShares));
//   expect(postTotalSupply).bigNumberEq(preTotalSupply.add(expectedFeeShares));
//   expect(postFundGav).bigNumberEq(preFundGav);
//   expect(postWethManager).bigNumberEq(preWethManager);
// });

// test('Investor redeems his shares', async () => {
//   const { feeManager, shares, vault } = fund;

//   const lastFeeConversion = new BN(
//     await call(managementFee, 'lastPayoutTime', [feeManager.options.address])
//   );

//   const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
//   const preFundHoldingsWeth = new BN(
//     await call(vault, 'assetBalances', [weth.options.address])
//   );
//   const preWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));
//   const preTotalSupply = new BN(await call(shares, 'totalSupply'));
//   const preInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));

//   // Delay 1 sec to ensure block new blocktime
//   await delay(1000);

//   await send(shares, 'redeemShares', [], investorTxOpts);

//   const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
//   const postFundHoldingsWeth = new BN(
//     await call(vault, 'assetBalances', [weth.options.address])
//   );
//   const postWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));
//   const postTotalSupply = new BN(await call(shares, 'totalSupply'));
//   const postFundGav = new BN(await call(shares, 'calcGav'));

//   const payoutTime = new BN(
//     await call(managementFee, 'lastPayoutTime', [feeManager.options.address])
//   );

//   const expectedPreDilutionFeeShares = BNExpMul(preTotalSupply, new BN(managementFeeRate))
//     .mul(payoutTime.sub(lastFeeConversion))
//     .div(yearInSeconds);
//   const expectedFeeShares = preTotalSupply.mul(expectedPreDilutionFeeShares)
//     .div(preTotalSupply.sub(expectedPreDilutionFeeShares));

//   const fundHoldingsWethDiff = preFundHoldingsWeth.sub(postFundHoldingsWeth);

//   // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal 
//   expect(fundHoldingsWethDiff).bigNumberEq(preFundBalanceOfWeth.sub(postFundBalanceOfWeth));

//   expect(fundHoldingsWethDiff).bigNumberEq(postWethInvestor.sub(preWethInvestor));
//   expect(postTotalSupply).bigNumberEq(
//     preTotalSupply.sub(preInvestorShares).add(expectedFeeShares)
//   );
//   expect(postWethInvestor).bigNumberEq(
//     preFundHoldingsWeth.mul(preInvestorShares)
//       .div(preTotalSupply.add(expectedFeeShares))
//       .add(preWethInvestor)
//   );
//   expect(postFundGav).bigNumberEq(postFundHoldingsWeth);
// });

// test('Manager redeems his shares', async () => {
//   const { shares } = fund;

//   const preManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
//   expect(preManagerShares).not.bigNumberEq(new BN(0));

//   // Delay 1 sec to ensure block new blocktime
//   await delay(1000);

//   await send(shares, 'redeemShares', [], managerTxOpts);

//   const postManagerShares = new BN(await call(shares, 'balanceOf', [manager]));
//   expect(postManagerShares).bigNumberEq(new BN(0));
// });
