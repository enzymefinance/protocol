/*
 * @file Tests how a non-Ether ERC20 token functions as a fund's quote token
 *
 * @test A fund receives an investment that is not its quote token
 * @test An investor redeems shares made up of only the quote token
 * @test A fund receives an investment that does not have a direct pair in the pricefeed
 * @test TODO: A fund places a take order with a quote token that is not 18 decimals
 */

import { BN, toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, send } from '~/deploy/utils/deploy-contract';
import { BNExpMul } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';

let deployer, manager, investor;
let defaultTxOpts, investorTxOpts, managerTxOpts;
let fundDenominationAsset;
let contracts, deployOut;
let knc, mln, weth, oasisDexExchange, version, priceSource;
let fund;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);

  contracts = deployed.contracts;
  deployOut = deployed.deployOut;
  version = contracts.Version;
  knc = contracts.KNC;
  mln = contracts.MLN;
  weth = contracts.WETH;
  priceSource = contracts.TestingPriceFeed;

  const oasisDexAdapter = contracts.OasisDexAdapter;
  oasisDexExchange = contracts.OasisDexExchange;

  const mlnKncAlreadyWhitelisted = await call(
    oasisDexExchange,
    'isTokenPairWhitelisted',
    [mln.options.address, knc.options.address]
  );
  if (!mlnKncAlreadyWhitelisted) {
    await send(
      oasisDexExchange,
      'addTokenPairWhitelist',
      [mln.options.address, knc.options.address],
      defaultTxOpts
    );
  }

  fund = await setupFundWithParams({
    defaultTokens: [mln.options.address, weth.options.address, knc.options.address],
    exchanges: [oasisDexExchange.options.address],
    exchangeAdapters: [oasisDexAdapter.options.address],
    manager,
    quoteToken: knc.options.address,
    version
  });

  // Seed investor with MLN and WETH
  await send(mln, 'transfer', [investor, toWei('1', 'ether')], defaultTxOpts);
  await send(weth, 'transfer', [investor, toWei('1', 'ether')], defaultTxOpts);
});

test('Quote asset is KNC', async () => {
  fundDenominationAsset = await call(fund.accounting, 'DENOMINATION_ASSET');
  expect(fundDenominationAsset).toBe(knc.options.address);
});

test('Fund gets non-quote asset from investment', async () => {
  const { accounting, participation, shares, trading } = fund;

  const offeredValue = toWei('1', 'ether');
  const wantedShares = toWei('1', 'ether');
  const amguAmount = toWei('.01', 'ether');

  // Calculate share cost
  const kncPriceInWeth = (await call(
    priceSource,
    'getReferencePriceInfo',
    [fundDenominationAsset, weth.options.address]
  ))[0];

  const expectedCostOfShares = BNExpMul(
    new BN(wantedShares.toString()),
    new BN(kncPriceInWeth.toString()),
  );

  const actualCostOfShares = new BN(
    await call(
      accounting,
      'getShareCostInAsset',
      [wantedShares, weth.options.address]
    )
  );
  expect(expectedCostOfShares).bigNumberEq(actualCostOfShares);

  // TODO: use less fake prices
  const fakePrices = Object.values(deployOut.tokens.addr).map(() => (new BN('10')).pow(new BN('18')).toString());
  await send(
    priceSource,
    'update',
    [Object.values(deployOut.tokens.addr), fakePrices],
    defaultTxOpts
  );

  const preWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));
  const preTotalSupply = new BN(await call(shares, 'totalSupply'));
  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
  const preFundHoldingsWeth = new BN(
    await call(accounting, 'getFundAssetHoldings', [weth.options.address])
  );

  await send(weth, 'approve', [participation.options.address, wantedShares], investorTxOpts);

  await send(
    participation,
    'requestInvestment',
    [wantedShares, offeredValue, weth.options.address],
    { ...investorTxOpts, value: amguAmount }
  );

  await send(
    participation,
    'executeRequestFor',
    [investor],
    investorTxOpts
  );

  const postWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));
  const postTotalSupply = new BN(await call(shares, 'totalSupply'));
  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
  const postFundHoldingsWeth = new BN(
    await call(accounting, 'getFundAssetHoldings', [weth.options.address])
  );
  const postFundGav = new BN(await call(accounting, 'calcGav'));

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
  const { accounting, participation, shares, trading } = fund;

  const investorShares =  new BN(await call(shares, 'balanceOf', [investor]));

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
  const preFundHoldingsWeth = new BN(
    await call(accounting, 'getFundAssetHoldings', [weth.options.address])
  );
  const preWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));
  const preTotalSupply = new BN(await call(shares, 'totalSupply'));

  await send(participation, 'redeem', [], investorTxOpts);

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
  const postFundHoldingsWeth = new BN(
    await call(accounting, 'getFundAssetHoldings', [weth.options.address])
  );
  const postWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));
  const postTotalSupply = new BN(await call(shares, 'totalSupply'));
  const postFundGav = new BN(await call(accounting, 'calcGav'));

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
  const { accounting, participation, shares, trading } = fund;

  const offeredValue = toWei('1', 'ether');
  const wantedShares = toWei('1', 'ether');
  const amguAmount = toWei('.01', 'ether');

  const kncPriceInMln = new BN(
    (await call(
      priceSource,
      'getReferencePriceInfo',
      [fundDenominationAsset, mln.options.address]
    ))[0]
  );
  const expectedCostOfShares = BNExpMul(new BN(wantedShares), kncPriceInMln);
  const actualCostOfShares = new BN(
    await call(
      accounting,
      'getShareCostInAsset',
      [wantedShares, mln.options.address]
    )
  );
  expect(expectedCostOfShares).bigNumberEq(actualCostOfShares);

  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
  const preFundHoldingsMln = new BN(
    await call(accounting, 'getFundAssetHoldings', [mln.options.address])
  );
  const preMlnInvestor = new BN(await call(mln, 'balanceOf', [investor]));
  const preTotalSupply = new BN(await call(shares, 'totalSupply'));
  const preFundGav = new BN(await call(accounting, 'calcGav'));

  await send(mln, 'approve', [participation.options.address, offeredValue], investorTxOpts);
  await send(
    participation,
    'requestInvestment',
    [wantedShares, offeredValue, mln.options.address],
    { ...investorTxOpts, value: amguAmount }
  );
  await send(
    participation,
    'executeRequestFor',
    [investor],
    investorTxOpts
  );

  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
  const postFundHoldingsMln = new BN(
    await call(accounting, 'getFundAssetHoldings', [mln.options.address])
  );
  const postMlnInvestor = new BN(await call(mln, 'balanceOf', [investor]));
  const postTotalSupply = new BN(await call(shares, 'totalSupply'));
  const postFundGav = new BN(await call(accounting, 'calcGav'));

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
