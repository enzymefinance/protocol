/*
 * @file Tests how a non-Ether ERC20 token functions as a fund's quote token
 *
 * @test A fund receives an investment that is not its quote token
 * @test An investor redeems shares made up of only the quote token
 * @test A fund receives an investment that does not have a direct pair in the pricefeed
 * @test A fund places a make order with a quote token that is not 18 decimals
 */

import { BN, toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, send } from '~/deploy/utils/deploy-contract';
import { BNExpMul } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { getFunctionSignature } from '~/tests/utils/metadata';

let deployer, manager, investor;
let defaultTxOpts, investorTxOpts, managerTxOpts;
let fundDenominationAsset;
let trade1;
let contracts, deployOut;
let knc, mln, weth, oasisDexExchange, version, priceSource;
let fund;
let exchangeIndex;
let makeOrderSignature;

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

  makeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'makeOrder',
  );

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
  exchangeIndex = 0;

  // Seed investor with MLN and WETH
  await send(mln, 'transfer', [investor, toWei('1', 'ether')], defaultTxOpts);
  await send(weth, 'transfer', [investor, toWei('1', 'ether')], defaultTxOpts);
});

test('Quote asset is KNC', async () => {
  fundDenominationAsset = await call(fund.accounting, 'DENOMINATION_ASSET');
  expect(fundDenominationAsset).toBe(knc.options.address);
});

test('Fund gets non-quote asset from investment', async () => {
  const { accounting, participation, shares, vault } = fund;

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

  const preWethVault = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));
  const preTotalSupply = new BN(await call(shares, 'totalSupply'));

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

  const postWethVault = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));
  const postTotalSupply = new BN(await call(shares, 'totalSupply'));
  const postFundGav = new BN(await call(accounting, 'calcGav'));

  const wethPriceInKnc = (await call(
    priceSource,
    'getReferencePriceInfo',
    [weth.options.address, fundDenominationAsset]
  ))[0];

  expect(postTotalSupply).bigNumberEq(preTotalSupply.add(new BN(wantedShares)));
  expect(postWethInvestor).bigNumberEq(preWethInvestor.sub(expectedCostOfShares));
  expect(postWethVault).bigNumberEq(preWethVault.add(expectedCostOfShares));
  expect(postFundGav).bigNumberEq(
    preWethVault.add(BNExpMul(expectedCostOfShares, new BN(wethPriceInKnc)))
  );
});

test('investor redeems his shares', async () => {
  const { accounting, participation, shares, vault } = fund;

  const investorShares =  new BN(await call(shares, 'balanceOf', [investor]));

  const preWethVault = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const preWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));
  const preTotalSupply = new BN(await call(shares, 'totalSupply'));

  await send(participation, 'redeem', [], investorTxOpts);

  const postWethVault = new BN(await call(weth, 'balanceOf', [vault.options.address]));
  const postWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));
  const postTotalSupply = new BN(await call(shares, 'totalSupply'));
  const postFundGav = new BN(await call(accounting, 'calcGav'));

  expect(postTotalSupply).bigNumberEq(preTotalSupply.sub(investorShares));
  expect(postWethInvestor).bigNumberEq(preWethInvestor.add(preWethVault));
  expect(postWethVault).bigNumberEq(new BN(0));
  expect(postFundGav).bigNumberEq(new BN(0));
});

test('Fund gets asset from investment that has no pair with the quote asset in the pricefeed', async () => {
  const { accounting, participation, shares, vault } = fund;

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

  const preMlnVault = new BN(await call(mln, 'balanceOf', [vault.options.address]));
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

  const postMlnVault = new BN(await call(mln, 'balanceOf', [vault.options.address]));
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

  expect(postTotalSupply).bigNumberEq(preTotalSupply.add(new BN(wantedShares)));
  expect(postMlnInvestor).bigNumberEq(preMlnInvestor.sub(expectedCostOfShares));
  expect(postMlnVault).bigNumberEq(preMlnVault.add(expectedCostOfShares));
  expect(postFundGav).bigNumberEq(
    preFundGav.add(BNExpMul(expectedCostOfShares, mlnPriceInKnc))
  );
});

test('Fund places a make order with a non-18 decimal quote token', async () => {
  const { accounting, trading, vault } = fund;

  trade1 = {
    makerAsset: knc.options.address,
    takerAsset: mln.options.address,
    sellQuantity: toWei('0.1', 'gwei'),
  };

  await send(knc, 'transfer', [vault.options.address, trade1.sellQuantity], defaultTxOpts);

  const kncPriceInMln = new BN(
    (await call(
      priceSource,
      'getReferencePriceInfo',
      [fundDenominationAsset, mln.options.address]
    ))[0]
  );
  trade1.buyQuantity = BNExpMul(
    new BN(trade1.sellQuantity),
    kncPriceInMln,
    9,
  ).toString();

  const preKncExchange = new BN(
    await call(knc, 'balanceOf', [oasisDexExchange.options.address])
  );
  const preKncVault = new BN(await call(knc, 'balanceOf', [vault.options.address]));
  const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
  const preMlnExchange = new BN(await call(mln, 'balanceOf', [oasisDexExchange.options.address]));
  const preMlnVault = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  const preFundCalcs = await call(accounting, 'performCalculations');

  await send(
    trading,
    'callOnExchange',
    [
      exchangeIndex,
      makeOrderSignature,
      [
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        trade1.makerAsset,
        trade1.takerAsset,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS
      ],
      [trade1.sellQuantity, trade1.buyQuantity, 0, 0, 0, 0, 0, 0],
      ['0x0', '0x0', '0x0', '0x0'],
      '0x0',
      '0x0',
    ],
    managerTxOpts
  );

  const postKncExchange = new BN(
    await call(knc, 'balanceOf', [oasisDexExchange.options.address])
  );
  const postKncVault = new BN(await call(knc, 'balanceOf', [vault.options.address]));
  const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
  const postMlnExchange = new BN(await call(mln, 'balanceOf', [oasisDexExchange.options.address]));
  const postMlnVault = new BN(await call(mln, 'balanceOf', [vault.options.address]));
  const postFundCalcs = await call(accounting, 'performCalculations');

  expect(preMlnExchange).bigNumberEq(postMlnExchange);
  expect(postMlnVault).bigNumberEq(preMlnVault);
  expect(postKncExchange).bigNumberEq(preKncExchange.add(new BN(trade1.sellQuantity)));
  expect(postKncVault).bigNumberEq(preKncVault.sub(new BN(trade1.sellQuantity)));
  expect(postFundCalcs.gav).toEqual(preFundCalcs.gav);
  expect(postFundCalcs.sharePrice).toEqual(preFundCalcs.sharePrice);
  expect(postMlnDeployer).bigNumberEq(preMlnDeployer);
});

test('Third party takes entire order', async () => {
  const { trading, vault } = fund;

  const orderId = await call(oasisDexExchange, 'last_offer_id');

  const preKncDeployer = new BN(await call(knc, 'balanceOf', [deployer]));
  const preKncExchange = new BN(await call(knc, 'balanceOf', [oasisDexExchange.options.address]));
  const preKncVault = new BN(await call(knc, 'balanceOf', [vault.options.address]));
  const preMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
  const preMlnExchange = new BN(await call(mln, 'balanceOf', [oasisDexExchange.options.address]));
  const preMlnVault = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  await send(mln, 'approve', [oasisDexExchange.options.address, trade1.buyQuantity], defaultTxOpts);
  await send(oasisDexExchange, 'buy', [orderId, trade1.sellQuantity], defaultTxOpts);
  await send(trading, 'returnBatchToVault', [[mln.options.address, weth.options.address]], managerTxOpts);

  const postKncDeployer = new BN(await call(knc, 'balanceOf', [deployer]));
  const postKncExchange = new BN(await call(knc, 'balanceOf', [oasisDexExchange.options.address]));
  const postKncVault = new BN(await call(knc, 'balanceOf', [vault.options.address]));
  const postMlnDeployer = new BN(await call(mln, 'balanceOf', [deployer]));
  const postMlnExchange = new BN(await call(mln, 'balanceOf', [oasisDexExchange.options.address]));
  const postMlnVault = new BN(await call(mln, 'balanceOf', [vault.options.address]));

  expect(preMlnExchange).bigNumberEq(postMlnExchange);
  expect(postKncExchange).bigNumberEq(preKncExchange.sub(new BN(trade1.sellQuantity)));
  expect(postKncVault).bigNumberEq(preKncVault);
  expect(postMlnVault).bigNumberEq(preMlnVault.add(new BN(trade1.buyQuantity)));
  expect(postKncDeployer).bigNumberEq(preKncDeployer.add(new BN(trade1.sellQuantity)));
  expect(postMlnDeployer).bigNumberEq(preMlnDeployer.sub(new BN(trade1.buyQuantity)));
});
