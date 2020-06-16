/*
 * @file Tests funds vault via the Oasis Dex adapter
 *
 * @test A fund can take an order (buy MLN with WETH)
 * @test A fund can take and order (buy WETH with MLN)
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import getAccounts from '~/deploy/utils/getAccounts';

import { BNExpDiv, BNExpMul } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import { getEventFromLogs, getFunctionSignature } from '~/tests/utils/metadata';
import { encodeOasisDexTakeOrderArgs } from '~/tests/utils/oasisDex';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let mln, weth, oasisDexAdapter, oasisDexExchange, priceSource;
let takeOrderSignature;
let fund;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  const deployed = await partialRedeploy(CONTRACT_NAMES.FUND_FACTORY);
  const contracts = deployed.contracts;

  mln = contracts.MLN;
  weth = contracts.WETH;
  oasisDexAdapter = contracts.OasisDexAdapter;
  oasisDexExchange = contracts.OasisDexExchange;
  priceSource = contracts.TestingPriceFeed;

  const fundFactory = contracts.FundFactory;

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  fund = await setupFundWithParams({
    integrationAdapters: [oasisDexAdapter.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor,
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    fundFactory
  });

  // Set prices to non-constant value (testing uses "1" for every rate)
  const wethRateConstant = toWei('1', 'ether');
  const mlnPerEthRate = toWei('0.5', 'ether');
  await send(
    priceSource,
    'update',
    [
      [weth.options.address, mln.options.address],
      [wethRateConstant, mlnPerEthRate]
    ],
    defaultTxOpts
  );
});

describe('Fund can take an order (buy MLN with WETH)', async () => {
  let makerAsset, makerQuantity, takerAsset, takerQuantity;
  let orderId;

  beforeAll(async () => {
    makerQuantity = toWei('0.1', 'ether');
    makerAsset = mln.options.address;
    takerAsset = weth.options.address;

    const makerToWethAssetRate = new BN(
      (await call(priceSource, 'getLiveRate', [makerAsset, weth.options.address]))[0]
    );

    takerQuantity = BNExpMul(
      new BN(makerQuantity),
      makerToWethAssetRate
    ).toString();
  });

  test('Third party makes an order', async () => {
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
    orderId = logMake.id;
  });

  test('Fund takes the order', async () => {
    const { vault } = fund;

    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const preFundHoldingsWeth = new BN(
      await call(vault, 'assetBalances', [weth.options.address])
    );
    const preFundHoldingsMln = new BN(
      await call(vault, 'assetBalances', [mln.options.address])
    );

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

    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const postFundHoldingsWeth = new BN(
      await call(vault, 'assetBalances', [weth.options.address])
    );
    const postFundHoldingsMln = new BN(
      await call(vault, 'assetBalances', [mln.options.address])
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
});

describe('Fund can take an order (buy WETH with MLN)', async () => {
  let makerAsset, makerQuantity, takerAsset, takerQuantity;
  let orderId;

  beforeAll(async () => {
    makerQuantity = toWei('0.01', 'ether');
    makerAsset = weth.options.address;
    takerAsset = mln.options.address;

    const takerToWethAssetRate = new BN(
      (await call(priceSource, 'getLiveRate', [takerAsset, weth.options.address]))[0]
    );
    takerQuantity = BNExpDiv(
      new BN(makerQuantity),
      takerToWethAssetRate
    ).toString();
  });

  test('Third party makes an order', async () => {
    await send(weth, 'approve', [oasisDexExchange.options.address, makerQuantity], defaultTxOpts);
    const res = await send(
      oasisDexExchange,
      'offer',
      [
        makerQuantity, makerAsset, takerQuantity, takerAsset, 0
      ],
      defaultTxOpts
    );

    const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
    orderId = logMake.id;
  });

  test('Fund takes the order', async () => {
    const { vault } = fund;

    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const preFundHoldingsWeth = new BN(
      await call(vault, 'assetBalances', [weth.options.address])
    );
    const preFundHoldingsMln = new BN(
      await call(vault, 'assetBalances', [mln.options.address])
    );

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

    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [vault.options.address]));
    const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [vault.options.address]));
    const postFundHoldingsWeth = new BN(
      await call(vault, 'assetBalances', [weth.options.address])
    );
    const postFundHoldingsMln = new BN(
      await call(vault, 'assetBalances', [mln.options.address])
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
});
