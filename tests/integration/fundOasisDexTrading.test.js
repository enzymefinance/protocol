/*
 * @file Tests funds trading via the Oasis Dex adapter
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

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let exchangeIndex;
let mln, weth, oasisDexExchange, priceSource;
let takeOrderFunctionSig;
let fund;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  const deployed = await partialRedeploy(CONTRACT_NAMES.VERSION);
  const contracts = deployed.contracts;

  mln = contracts.MLN;
  weth = contracts.WETH;
  oasisDexExchange = contracts.OasisDexExchange;
  priceSource = contracts.TestingPriceFeed;

  const oasisDexAdapter = contracts.OasisDexAdapter;
  const version = contracts.Version;

  takeOrderFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  fund = await setupFundWithParams({
    defaultTokens: [mln.options.address, weth.options.address],
    exchanges: [oasisDexExchange.options.address],
    exchangeAdapters: [oasisDexAdapter.options.address],
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
      (await call(priceSource, 'getPrice', [makerAsset]))[0]
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
    const { accounting, trading } = fund;

    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
    const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
    const preFundHoldingsWeth = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
    );
    const preFundHoldingsMln = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
    );
  
    await send(
      trading,
      'callOnExchange',
      [
        exchangeIndex,
        takeOrderFunctionSig,
        [
          deployer,
          trading.options.address,
          makerAsset,
          takerAsset,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
        ['0x0', '0x0', '0x0', '0x0'],
        orderId,
        '0x0',
      ],
      managerTxOpts
    );
  
    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
    const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
    const postFundHoldingsWeth = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
    );
    const postFundHoldingsMln = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
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
      (await call(priceSource, 'getPrice', [takerAsset]))[0]
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
    const { accounting, trading } = fund;

    const preFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
    const preFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
    const preFundHoldingsWeth = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
    );
    const preFundHoldingsMln = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
    );
  
    await send(
      trading,
      'callOnExchange',
      [
        exchangeIndex,
        takeOrderFunctionSig,
        [
          deployer,
          trading.options.address,
          makerAsset,
          takerAsset,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
        ['0x0', '0x0', '0x0', '0x0'],
        orderId,
        '0x0',
      ],
      managerTxOpts
    );
  
    const postFundBalanceOfWeth = new BN(await call(weth, 'balanceOf', [trading.options.address]));
    const postFundBalanceOfMln = new BN(await call(mln, 'balanceOf', [trading.options.address]));
    const postFundHoldingsWeth = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [weth.options.address])
    );
    const postFundHoldingsMln = new BN(
      await call(accounting, 'getFundHoldingsForAsset', [mln.options.address])
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
