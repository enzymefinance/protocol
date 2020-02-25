/*
 * @file Tests funds trading via the Kyber adapter
 *
 * @test Fund takes a MLN order with WETH using KyberNetworkProxy's expected price
 * @test Fund takes a WETH order with MLN using KyberNetworkProxy's expected price
 * @test Fund takes a EUR order with MLN without intermediary options specified
 * @test Fund take order fails with too high maker quantity
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { BNExpMul } from '~/tests/utils/BNmath';
import {
  CONTRACT_NAMES,
  EMPTY_ADDRESS,
  KYBER_ETH_ADDRESS,
} from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { getFunctionSignature } from '~/tests/utils/metadata';

let defaultTxOpts, managerTxOpts;
let deployer, manager, investor;
let contracts;
let exchangeIndex, takeOrderSignature;
let version, kyberAdapter, kyberNetworkProxy, weth, mln, eur;
let fund;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  contracts = deployed.contracts;

  version = contracts.Version;
  kyberAdapter = contracts.KyberAdapter;
  kyberNetworkProxy = contracts.KyberNetworkProxy;
  weth = contracts.WETH;
  mln = contracts.MLN;
  eur = contracts.EUR;

  fund = await setupFundWithParams({
    defaultTokens: [mln.options.address, weth.options.address],
    exchanges: [kyberNetworkProxy.options.address],
    exchangeAdapters: [kyberAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    version
  });

  exchangeIndex = 0;

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder'
  );
});

test('swap WETH for MLN with expected rate from kyberNetworkProxy', async () => {
  const { accounting, trading } = fund;

  const takerAsset = weth.options.address;
  const takerQuantity = toWei('0.1', 'ether');
  const makerAsset = mln.options.address;

  const { 0: expectedRate } = await call(
    kyberNetworkProxy,
    'getExpectedRate',
    [KYBER_ETH_ADDRESS, makerAsset, takerQuantity],
  );

  const makerQuantity = BNExpMul(
    new BN(takerQuantity.toString()),
    new BN(expectedRate.toString()),
  ).toString();

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
  const preFundHoldingsWeth = new BN(
    await call(accounting, 'getFundAssetHoldings', [weth.options.address])
  );
  const preFundHoldingsMln = new BN(
    await call(accounting, 'getFundAssetHoldings', [mln.options.address])
  );

  await send(
    trading,
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
      '0x0',
      '0x0',
    ],
    managerTxOpts
  );

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
  const postFundHoldingsWeth = new BN(
    await call(accounting, 'getFundAssetHoldings', [weth.options.address])
  );
  const postFundHoldingsMln = new BN(
    await call(accounting, 'getFundAssetHoldings', [mln.options.address])
  );

  const fundHoldingsWethDiff = preFundHoldingsWeth.sub(postFundHoldingsWeth);
  const fundHoldingsMlnDiff = postFundHoldingsMln.sub(preFundHoldingsMln);

  // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal 
  expect(fundHoldingsWethDiff).bigNumberEq(preFundBalanceOfWeth.sub(postFundBalanceOfWeth));
  expect(fundHoldingsMlnDiff).bigNumberEq(postFundBalanceOfMln.sub(preFundBalanceOfMln));

  // Confirm that expected asset amounts were filled
  expect(fundHoldingsWethDiff).bigNumberEq(new BN(takerQuantity));
  expect(fundHoldingsMlnDiff).bigNumberEq(new BN(makerQuantity));
});

test('swap MLN for WETH with expected rate from kyberNetworkProxy', async () => {
  const { accounting, trading } = fund;

  const takerAsset = mln.options.address;
  const takerQuantity = toWei('0.01', 'ether');
  const makerAsset = weth.options.address;

  const { 0: expectedRate } = await call(
    kyberNetworkProxy,
    'getExpectedRate',
    [takerAsset, KYBER_ETH_ADDRESS, takerQuantity],
  );

  const makerQuantity = BNExpMul(
    new BN(takerQuantity.toString()),
    new BN(expectedRate.toString()),
  ).toString();

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
  const preFundHoldingsWeth = new BN(
    await call(accounting, 'getFundAssetHoldings', [weth.options.address])
  );
  const preFundHoldingsMln = new BN(
    await call(accounting, 'getFundAssetHoldings', [mln.options.address])
  );

  await send(
    trading,
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
        EMPTY_ADDRESS
      ],
      [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
      ['0x0', '0x0', '0x0', '0x0'],
      '0x0',
      '0x0',
    ],
    managerTxOpts
  );

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
  const postFundHoldingsWeth = new BN(
    await call(accounting, 'getFundAssetHoldings', [weth.options.address])
  );
  const postFundHoldingsMln = new BN(
    await call(accounting, 'getFundAssetHoldings', [mln.options.address])
  );

  const fundHoldingsWethDiff = postFundHoldingsWeth.sub(preFundHoldingsWeth);
  const fundHoldingsMlnDiff = preFundHoldingsMln.sub(postFundHoldingsMln);

  // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal 
  expect(fundHoldingsWethDiff).bigNumberEq(postFundBalanceOfWeth.sub(preFundBalanceOfWeth));
  expect(fundHoldingsMlnDiff).bigNumberEq(preFundBalanceOfMln.sub(postFundBalanceOfMln));

  // Confirm that expected asset amounts were filled
  expect(fundHoldingsWethDiff).bigNumberEq(new BN(makerQuantity));
  expect(fundHoldingsMlnDiff).bigNumberEq(new BN(takerQuantity));
});

test('swap MLN directly to EUR without intermediary', async () => {
  const { accounting, trading } = fund;

  const takerAsset = mln.options.address;
  const takerQuantity = toWei('0.01', 'ether');
  const makerAsset = eur.options.address;

  const { 0: expectedRate } = await call(
    kyberNetworkProxy,
    'getExpectedRate',
    [takerAsset, makerAsset, takerQuantity],
  );

  const makerQuantity = BNExpMul(
    new BN(takerQuantity.toString()),
    new BN(expectedRate.toString()),
  ).toString();

  const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
  const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
  const preFundBalanceOfEur = new BN(await call(eur, 'balanceOf', [trading.options.address]));
  const preFundHoldingsWeth = new BN(
    await call(accounting, 'getFundAssetHoldings', [weth.options.address])
  );
  const preFundHoldingsMln = new BN(
    await call(accounting, 'getFundAssetHoldings', [mln.options.address])
  );
  const preFundHoldingsEur = new BN(
    await call(accounting, 'getFundAssetHoldings', [eur.options.address])
  );

  await send(
    trading,
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
        EMPTY_ADDRESS
      ],
      [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
      ['0x0', '0x0', '0x0', '0x0'],
      '0x0',
      '0x0',
    ],
    managerTxOpts
  );

  const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
  const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
  const postFundBalanceOfEur = new BN(await call(eur, 'balanceOf', [trading.options.address]));
  const postFundHoldingsWeth = new BN(
    await call(accounting, 'getFundAssetHoldings', [weth.options.address])
  );
  const postFundHoldingsMln = new BN(
    await call(accounting, 'getFundAssetHoldings', [mln.options.address])
  );
  const postFundHoldingsEur = new BN(
    await call(accounting, 'getFundAssetHoldings', [eur.options.address])
  );

  const fundHoldingsWethDiff = preFundHoldingsWeth.sub(postFundHoldingsWeth);
  const fundHoldingsMlnDiff = preFundHoldingsMln.sub(postFundHoldingsMln);
  const fundHoldingsEurDiff = postFundHoldingsEur.sub(preFundHoldingsEur);

  // Confirm that ERC20 token balances and assetBalances (internal accounting) diffs are equal 
  expect(fundHoldingsWethDiff).bigNumberEq(preFundBalanceOfWeth.sub(postFundBalanceOfWeth));
  expect(fundHoldingsMlnDiff).bigNumberEq(preFundBalanceOfMln.sub(postFundBalanceOfMln));
  expect(fundHoldingsEurDiff).bigNumberEq(postFundBalanceOfEur.sub(preFundBalanceOfEur));

  // Confirm that expected asset amounts were filled
  expect(fundHoldingsEurDiff).bigNumberEq(new BN(makerQuantity));
  expect(fundHoldingsMlnDiff).bigNumberEq(new BN(takerQuantity));
  expect(fundHoldingsWethDiff).bigNumberEq(new BN(0));
});

test('swap fails if make quantity is too high', async () => {
  const { trading } = fund;

  const takerAsset = mln.options.address;
  const takerQuantity = toWei('0.01', 'ether');
  const makerAsset = eur.options.address;

  const { 0: expectedRate } = await call(
    kyberNetworkProxy,
    'getExpectedRate',
    [takerAsset, makerAsset, takerQuantity],
  );

  const makerQuantity = BNExpMul(
    new BN(takerQuantity.toString()),
    new BN(expectedRate.toString()).mul(new BN(2)),
  ).toString();

  await expect(
    send(
      trading,
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
      '0x0',
      '0x0',
      ],
      managerTxOpts
    )
  ).rejects.toThrowFlexible("received less buy asset than expected");
});
