/*
 * @file Tests how a non-Ether ERC20 token functions as a fund's quote token
 *
 * @test A fund receives an investment that is not its quote token
 * @test An investor redeems shares made up of only the quote token
 * @test A fund receives an investment that does not have a direct pair in the pricefeed
 * @test TODO: A fund places a take order with a quote token that is not 18 decimals
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { BNExpDiv, BNExpMul } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import { getDeployed } from '~/tests/utils/getDeployed';
import { updateKyberPriceFeed } from '~/tests/utils/updateKyberPriceFeed';

const mainnetAddrs = require('../../mainnet_thirdparty_contracts');

let web3
let deployer, manager, investor;
let defaultTxOpts, investorTxOpts;
let fundDenominationAsset;
let knc, mln, weth, fundFactory, priceSource;
let fund;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);

  mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  knc = getDeployed(CONTRACT_NAMES.KNC, web3, mainnetAddrs.tokens.KNC);

  const oasisDexAdapter = getDeployed(CONTRACT_NAMES.OASIS_DEX_ADAPTER, web3);

  fund = await setupFundWithParams({
    defaultTokens: [mln.options.address, weth.options.address, knc.options.address],
    integrationAdapters: [oasisDexAdapter.options.address],
    manager,
    quoteToken: knc.options.address,
    fundFactory,
    web3
  });

  // Seed investor with MLN and WETH
  await send(mln, 'transfer', [investor, toWei('1', 'ether')], defaultTxOpts, web3);
  await send(weth, 'transfer', [investor, toWei('1', 'ether')], defaultTxOpts, web3);
});

test('Quote asset is KNC', async () => {
  fundDenominationAsset = await call(fund.shares, 'DENOMINATION_ASSET');
  expect(fundDenominationAsset).toBe(knc.options.address);
});

test('Fund gets non-quote asset from investment', async () => {
  const { hub, shares, vault } = fund;

  const contribAmount = toWei('1', 'ether');
  const shareCost = new BN(
    await call(
      shares,
      'getSharesCostInAsset',
      [toWei('1', 'ether'), weth.options.address]
    )
  );
  const wantedShares = BNExpDiv(new BN(contribAmount), shareCost);

  // Calculate share cost
  const kncPriceInWeth = (await call(
    priceSource,
    'getReferencePriceInfo',
    [fundDenominationAsset, weth.options.address]
  ))[0];

  const expectedCostOfShares = BNExpMul(
    wantedShares,
    new BN(kncPriceInWeth.toString()),
  );

  const actualCostOfShares = new BN(
    await call(
      shares,
      'getSharesCostInAsset',
      [wantedShares.toString(), weth.options.address]
    )
  );
  expect(expectedCostOfShares).bigNumberEq(actualCostOfShares);

  await updateKyberPriceFeed(priceSource, web3);
  // // TODO: use less fake prices
  // const fakePrices = Object.values(deployOut.tokens.addr).map(() => (new BN('10')).pow(new BN('18')).toString());
  // await send(
  //   priceSource,
  //   'update',
  //   [Object.values(deployOut.tokens.addr), fakePrices],
  //   defaultTxOpts,
  //   web3
  // );

  const preWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));
  const preTotalSupply = new BN(await call(shares, 'totalSupply'));
  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundHoldingsWeth = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  );

  await investInFund({
    fundAddress: hub.options.address,
    investment: {
      contribAmount,
      investor,
      isInitial: true,
      tokenContract: weth
    },
    web3
  });

  const postWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));
  const postTotalSupply = new BN(await call(shares, 'totalSupply'));
  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postFundHoldingsWeth = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  );
  const postFundGav = new BN(await call(shares, 'calcGav'));

  const wethPriceInKnc = (await call(
    priceSource,
    'getReferencePriceInfo',
    [weth.options.address, fundDenominationAsset]
  ))[0];

  const fundHoldingsWethDiff = postFundHoldingsWeth.sub(preFundHoldingsWeth);

  // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal 
  expect(fundHoldingsWethDiff).bigNumberEq(postFundBalanceOfWeth.sub(preFundBalanceOfWeth));
  
  expect(postTotalSupply).bigNumberEq(preTotalSupply.add(new BN(wantedShares)));
  expect(postWethInvestor).bigNumberEq(preWethInvestor.sub(expectedCostOfShares));
  expect(fundHoldingsWethDiff).bigNumberEq(expectedCostOfShares);
  expect(postFundGav).bigNumberEq(
    preFundHoldingsWeth.add(BNExpMul(expectedCostOfShares, new BN(wethPriceInKnc)))
  );
});

test('investor redeems his shares', async () => {
  const { shares, vault } = fund;

  const investorShares =  new BN(await call(shares, 'balanceOf', [investor]));

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preFundHoldingsWeth = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  );
  const preWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));
  const preTotalSupply = new BN(await call(shares, 'totalSupply'));

  await send(shares, 'redeemShares', [], investorTxOpts, web3);

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postFundHoldingsWeth = new BN(
    await call(vault, 'assetBalances', [weth.options.address])
  );
  const postWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));
  const postTotalSupply = new BN(await call(shares, 'totalSupply'));
  const postFundGav = new BN(await call(shares, 'calcGav'));

  // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal 
  expect(postFundHoldingsWeth.sub(preFundHoldingsWeth)).bigNumberEq(
    postFundBalanceOfWeth.sub(preFundBalanceOfWeth)
  );

  expect(postTotalSupply).bigNumberEq(preTotalSupply.sub(investorShares));
  expect(postWethInvestor).bigNumberEq(preWethInvestor.add(preFundHoldingsWeth));
  expect(postFundHoldingsWeth).bigNumberEq(new BN(0));
  expect(postFundGav).bigNumberEq(new BN(0));
});

test('Fund gets asset from investment that has no pair with the quote asset in the pricefeed', async () => {
  const { hub, shares, vault } = fund;

  const contribAmount = toWei('1', 'ether');
  const shareCost = new BN(
    await call(
      shares,
      'getSharesCostInAsset',
      [toWei('1', 'ether'), mln.options.address]
    )
  );
  const wantedShares = BNExpDiv(new BN(contribAmount), shareCost);

  const kncPriceInMln = new BN(
    (await call(
      priceSource,
      'getReferencePriceInfo',
      [fundDenominationAsset, mln.options.address]
    ))[0]
  );
  const expectedCostOfShares = BNExpMul(wantedShares, kncPriceInMln);
  const actualCostOfShares = new BN(
    await call(
      shares,
      'getSharesCostInAsset',
      [wantedShares.toString(), mln.options.address]
    )
  );
  expect(expectedCostOfShares).bigNumberEq(actualCostOfShares);

  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  const preFundHoldingsMln = new BN(
    await call(vault, 'assetBalances', [mln.options.address])
  );
  const preMlnInvestor = new BN(await call(mln, 'balanceOf', [investor]));
  const preTotalSupply = new BN(await call(shares, 'totalSupply'));
  const preFundGav = new BN(await call(shares, 'calcGav'));

  // @dev this works as isInitial because the pre test redeems all of the Shares.totalSupply()
  await investInFund({
    fundAddress: hub.options.address,
    investment: {
      contribAmount,
      investor,
      isInitial: true,
      tokenContract: mln
    },
    web3
  });

  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  const postFundHoldingsMln = new BN(
    await call(vault, 'assetBalances', [mln.options.address])
  );
  const postMlnInvestor = new BN(await call(mln, 'balanceOf', [investor]));
  const postTotalSupply = new BN(await call(shares, 'totalSupply'));
  const postFundGav = new BN(await call(shares, 'calcGav'));

  const mlnPriceInKnc = new BN(
    (await call(
      priceSource,
      'getReferencePriceInfo',
      [mln.options.address, fundDenominationAsset]
    ))[0]
  );

  const fundHoldingsMlnDiff = postFundHoldingsMln.sub(preFundHoldingsMln);

  // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal 
  expect(fundHoldingsMlnDiff).bigNumberEq(postFundBalanceOfMln.sub(preFundBalanceOfMln));

  expect(postTotalSupply).bigNumberEq(preTotalSupply.add(new BN(wantedShares)));
  expect(postMlnInvestor).bigNumberEq(preMlnInvestor.sub(expectedCostOfShares));
  expect(fundHoldingsMlnDiff).bigNumberEq(expectedCostOfShares);
  expect(postFundGav).bigNumberEq(
    preFundGav.add(BNExpMul(expectedCostOfShares, mlnPriceInKnc))
  );
});
