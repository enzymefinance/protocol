/*
 * @file Tests a fund's risk management policies in executing trades
 *
 * @test Fund policies are set
 * @test TODO: A fund can only take an order for a non-blacklisted asset
 * @test TODO: A fund can only take an order with a tolerable amount of price slippage
 * @test TODO: A fund cannot take an order with an asset if it will exceed its max concentration
 * @test TODO: A fund can only take an order for a whitelisted asset
 * @test TODO: A fund can only take an order for its current assets once max positions is reached
 */

import { BN, toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, send } from '~/deploy/utils/deploy-contract';
import { BNExpMul, BNExpDiv } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { encodeArgs } from '~/tests/utils/formatting';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import {
  getEventFromLogs,
  getFunctionSignature
} from '~/tests/utils/metadata';
import { encodeOasisDexTakeOrderArgs } from '~/tests/utils/oasisDex';

let deployer, manager;
let defaultTxOpts, managerTxOpts;
let takeOrderFunctionSig;
let fundFactory, oasisDexAdapter, priceSource;
let assetBlacklist, assetWhitelist, maxConcentration, maxPositions, priceTolerance;
let dai, knc, mln, weth, zrx;
let oasisDexExchange;
let contracts;

beforeAll(async () => {
  [deployer, manager] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  contracts = deployed.contracts;

  dai = contracts.DAI;
  knc = contracts.KNC;
  mln = contracts.MLN;
  weth = contracts.WETH;
  zrx = contracts.ZRX;

  fundFactory = contracts.FundFactory;
  oasisDexExchange = contracts.OasisDexExchange;
  oasisDexAdapter = contracts.OasisDexAdapter;
  priceSource = contracts.TestingPriceFeed;

  // Policies
  assetBlacklist = contracts.AssetBlacklist;
  assetWhitelist = contracts.AssetWhitelist;
  maxPositions = contracts.MaxPositions;
  maxConcentration = contracts.MaxConcentration;
  priceTolerance = contracts.PriceTolerance;

  takeOrderFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  const wethRateConstant = toWei('1', 'ether');
  const wethToDaiRate = toWei('0.008', 'ether');
  const wethToKncRate = toWei('0.005', 'ether');
  const wethToMlnRate = toWei('0.5', 'ether');
  const wethToZrxRate = toWei('0.25', 'ether');
  await send(
    priceSource,
    'update',
    [
      [
        weth.options.address,
        mln.options.address,
        knc.options.address,
        dai.options.address,
        zrx.options.address
      ],
      [
        wethRateConstant,
        wethToMlnRate,
        wethToKncRate,
        wethToDaiRate,
        wethToZrxRate
      ]
    ],
    defaultTxOpts
  );
});

/*
 * Fund #1: Take orders on Oasis Dex
 * Asset blacklist: KNC
 * Max concentration: 10%
 * Max positions: 3
 * Price tolerance: 10%
 */
describe('Fund 1: Asset blacklist, price tolerance, max positions, max concentration', () => {
  let fund;
  let priceToleranceVal, maxConcentrationVal;

  beforeAll(async () => {
    const policies = {
      addresses: [
        assetBlacklist.options.address,
        maxPositions.options.address,
        maxConcentration.options.address,
        priceTolerance.options.address
      ],
      encodedSettings: [
        encodeArgs(['address[]'], [[knc.options.address]]),
        encodeArgs(['uint256'], [3]),
        encodeArgs(['uint256'], [toWei('0.1', 'ether')]), // 10%
        encodeArgs(['uint256'], [toWei('0.1', 'ether')]), // 10%
      ]
    };
    fund = await setupFundWithParams({
      defaultTokens: [weth.options.address],
      integrationAdapters: [oasisDexAdapter.options.address],
      initialInvestment: {
        contribAmount: toWei('1', 'ether'),
        investor: manager,
        tokenContract: weth
      },
      manager,
      policies: {
        addresses: policies.addresses,
        encodedSettings: policies.encodedSettings
      },
      quoteToken: weth.options.address,
      fundFactory
    });
    maxConcentrationVal = await call(
      maxConcentration,
      'policyManagerToMaxConcentration',
      [fund.policyManager.options.address]
    );
    priceToleranceVal = await call(
      priceTolerance,
      'policyManagerToPriceTolerance',
      [fund.policyManager.options.address]
    );
  });

  test('Confirm policies have been set', async () => {
    const { policyManager } = fund;

    const policies = await call (policyManager, 'getEnabledPolicies');
    const expectedPolicies = [
      priceTolerance.options.address,
      maxPositions.options.address,
      assetBlacklist.options.address,
      maxConcentration.options.address
    ];

    for (const policy of expectedPolicies) {
      expect(policies).toContain(policy);
    }
  });

  describe('Asset blacklist', () => {
    let badMakerAsset, badMakerQuantity, goodMakerAsset, goodMakerQuantity, takerAsset, takerQuantity;
    let badOrderId, goodOrderId;

    beforeAll(async () => {
      takerAsset = weth.options.address;
      takerQuantity = toWei('0.01', 'ether');
      badMakerAsset = knc.options.address;
      goodMakerAsset = mln.options.address;
    });

    test('Third party makes an order', async () => {
      const makerToWethAssetRate = new BN(
        (await call(priceSource, 'getLiveRate', [badMakerAsset, weth.options.address]))[0]
      );
      badMakerQuantity = BNExpDiv(
        new BN(takerQuantity),
        makerToWethAssetRate
      ).toString();

      await send(knc, 'approve', [oasisDexExchange.options.address, badMakerQuantity], defaultTxOpts);
      const res = await send(
        oasisDexExchange,
        'offer',
        [
          badMakerQuantity, badMakerAsset, takerQuantity, takerAsset, 0
        ],
        defaultTxOpts
      );

      const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
      badOrderId = logMake.id;
    });

    test('Bad take order: blacklisted maker asset', async () => {
      const { vault } = fund;

      const encodedArgs = encodeOasisDexTakeOrderArgs({
        makerAsset: badMakerAsset,
        makerQuantity: badMakerQuantity,
        takerAsset,
        takerQuantity,
        orderId: badOrderId,
      });

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            oasisDexAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts,
        )
      ).rejects.toThrowFlexible('Rule evaluated to false: ASSET_BLACKLIST');
    });

    test('Third party makes an order', async () => {
      const makerToWethAssetRate = new BN(
        (await call(priceSource, 'getLiveRate', [goodMakerAsset, weth.options.address]))[0]
      );
      goodMakerQuantity = BNExpDiv(
        new BN(takerQuantity),
        makerToWethAssetRate
      ).toString();

      await send(mln, 'approve', [oasisDexExchange.options.address, goodMakerQuantity], defaultTxOpts);
      const res = await send(
        oasisDexExchange,
        'offer',
        [
          goodMakerQuantity, goodMakerAsset, takerQuantity, takerAsset, 0
        ],
        defaultTxOpts
      );

      const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
      goodOrderId = logMake.id;
    });

    test('Good take order: non-blacklisted maker asset', async () => {
      const { vault } = fund;

      const encodedArgs = encodeOasisDexTakeOrderArgs({
        makerAsset: goodMakerAsset,
        makerQuantity: goodMakerQuantity,
        takerAsset,
        takerQuantity,
        orderId: goodOrderId,
      });

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            oasisDexAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts,
        )
      ).resolves.not.toThrow();
    });
  });

  describe('Price tolerance', () => {
    let makerAsset, takerAsset, takerQuantity;
    let expectedMakerQuantity, badMakerQuantity, toleratedMakerQuantity;
    let makerQuantityPercentLimit, makerQuantityPercentShift;
    let badOrderId, goodOrderId;

    beforeAll(async () => {
      makerAsset = mln.options.address;
      takerAsset = weth.options.address;
      takerQuantity = toWei('0.01', 'ether');

      const makerToWethAssetRate = new BN(
        (await call(priceSource, 'getLiveRate', [makerAsset, weth.options.address]))[0]
      );
      expectedMakerQuantity = BNExpDiv(
        new BN(takerQuantity),
        makerToWethAssetRate
      ).toString();

      makerQuantityPercentLimit =
        new BN(toWei('1', 'ether')).sub(new BN(priceToleranceVal));
      makerQuantityPercentShift = new BN(toWei('0.01', 'ether')); // 1%
    });

    test('Third party makes an order', async () => {
      badMakerQuantity = BNExpMul(
        new BN(expectedMakerQuantity),
        makerQuantityPercentLimit.sub(makerQuantityPercentShift)
      ).toString();

      await send(mln, 'approve', [oasisDexExchange.options.address, badMakerQuantity], defaultTxOpts);
      const res = await send(
        oasisDexExchange,
        'offer',
        [
          badMakerQuantity, makerAsset, takerQuantity, takerAsset, 0
        ],
        defaultTxOpts
      );

      const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
      badOrderId = logMake.id;
    });

    test('Bad take order: slippage just above limit', async () => {
      const { vault } = fund;

      const encodedArgs = encodeOasisDexTakeOrderArgs({
        makerAsset,
        makerQuantity: badMakerQuantity,
        takerAsset,
        takerQuantity,
        orderId: badOrderId,
      });

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            oasisDexAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts,
        )
      ).rejects.toThrowFlexible('Rule evaluated to false: PRICE_TOLERANCE');
    });

    test('Third party makes an order', async () => {
      toleratedMakerQuantity = BNExpMul(
        new BN(expectedMakerQuantity),
        makerQuantityPercentLimit.add(makerQuantityPercentShift)
      ).toString();

      await send(mln, 'approve', [oasisDexExchange.options.address, toleratedMakerQuantity], defaultTxOpts);
      const res = await send(
        oasisDexExchange,
        'offer',
        [
          toleratedMakerQuantity, makerAsset, takerQuantity, takerAsset, 0
        ],
        defaultTxOpts
      );

      const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
      goodOrderId = logMake.id;
    });

    test('Good take order: slippage just within limit', async () => {
      const { vault } = fund;

      const encodedArgs = encodeOasisDexTakeOrderArgs({
        makerAsset,
        makerQuantity: toleratedMakerQuantity,
        takerAsset,
        takerQuantity,
        orderId: goodOrderId,
      });

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            oasisDexAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts,
        )
      ).resolves.not.toThrow();
    });
  });

  describe('Max concentration', () => {
    let makerAsset, takerAsset;
    let makerToWethAssetRate;
    let goodMakerQuantity, goodOrderId, goodTakerQuantity;
    let badMakerQuantity, badOrderId, badTakerQuantity;

    beforeAll(async () => {
      const { shares, vault } = fund;
      makerAsset = dai.options.address;
      takerAsset = weth.options.address;
      makerToWethAssetRate = new BN(
        (await call(priceSource, 'getLiveRate', [makerAsset, weth.options.address]))[0]
      );

      const makerAssetGav = BNExpMul(
        new BN(await call(vault, 'assetBalances', [makerAsset])),
        makerToWethAssetRate
      );

      const fundGav = new BN(await call(shares, 'calcGav'));
      const makerAssetGavPercent = BNExpDiv(makerAssetGav, fundGav);
      const allowedMakerAssetGavPercentage =
        new BN(maxConcentrationVal).sub(makerAssetGavPercent);

      const percentageShift = new BN(toWei('0.01', 'ether')); // 1%

      goodTakerQuantity = BNExpMul(
        fundGav,
        allowedMakerAssetGavPercentage.sub(percentageShift)
      ).toString();

      goodMakerQuantity = BNExpDiv(
        new BN(goodTakerQuantity),
        new BN(makerToWethAssetRate)
      ).toString();

      badTakerQuantity = BNExpMul(
        fundGav,
        percentageShift.mul(new BN(2)) // guarantees slightly too much
      ).toString();
      badMakerQuantity = BNExpDiv(
        new BN(badTakerQuantity),
        makerToWethAssetRate
      ).toString();
    });

    test('Third party makes an order', async () => {
      await send(dai, 'approve', [oasisDexExchange.options.address, goodMakerQuantity], defaultTxOpts);
      const res = await send(
        oasisDexExchange,
        'offer',
        [
          goodMakerQuantity, makerAsset, goodTakerQuantity, takerAsset, 0
        ],
        defaultTxOpts
      );

      const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
      goodOrderId = logMake.id;
    });

    test('Good make order: just under max-concentration', async () => {
      const { vault } = fund;

      const encodedArgs = encodeOasisDexTakeOrderArgs({
        makerAsset,
        makerQuantity: goodMakerQuantity,
        takerAsset,
        takerQuantity: goodTakerQuantity,
        orderId: goodOrderId,
      });

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            oasisDexAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts,
        )
      ).resolves.not.toThrow();
    });

    test('Third party makes an order', async () => {
      await send(dai, 'approve', [oasisDexExchange.options.address, badMakerQuantity], defaultTxOpts);
      const res = await send(
        oasisDexExchange,
        'offer',
        [
          badMakerQuantity, makerAsset, badTakerQuantity, takerAsset, 0
        ],
        defaultTxOpts
      );

      const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
      badOrderId = logMake.id;
    });

    test('Bad make order: max concentration exceeded', async () => {
      const { vault } = fund;

      const encodedArgs = encodeOasisDexTakeOrderArgs({
        makerAsset,
        makerQuantity: badMakerQuantity,
        takerAsset,
        takerQuantity: badTakerQuantity,
        orderId: badOrderId,
      });

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            oasisDexAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts,
        )
      ).rejects.toThrowFlexible('Rule evaluated to false: MAX_CONCENTRATION');
    });
  });
});

/*
 * Fund #2: Trading on Oasis Dex
 * Asset whitelist: DAI, MLN, ZRX
 * Max positions: 3
 */
describe('Fund 2: Asset whitelist, max positions', () => {
  let fund;

  beforeAll(async () => {
    const policies = {
      addresses: [
        assetWhitelist.options.address,
        maxPositions.options.address
      ],
      encodedSettings: [
        encodeArgs(
          ['address[]'],
          [[dai.options.address, mln.options.address, zrx.options.address]]
        ),
        encodeArgs(['uint256'], [3])
      ]
    };
    fund = await setupFundWithParams({
      defaultTokens: [weth.options.address],
      integrationAdapters: [oasisDexAdapter.options.address],
      initialInvestment: {
        contribAmount: toWei('1', 'ether'),
        investor: manager,
        tokenContract: weth
      },
      manager,
      policies: {
        addresses: policies.addresses,
        encodedSettings: policies.encodedSettings
      },
      quoteToken: weth.options.address,
      fundFactory
    });
  });

  test('Confirm policies have been set', async () => {
    const { policyManager } = fund;

    const policies = await call (policyManager, 'getEnabledPolicies');
    const expectedPolicies = [
      maxPositions.options.address,
      assetWhitelist.options.address
    ];

    for (const policy of expectedPolicies) {
      expect(policies).toContain(policy);
    }
  });

  describe('Asset whitelist', () => {
    let takerAsset, takerQuantity;
    let badMakerAsset, badMakerQuantity, badOrderId;
    let goodMakerAsset, goodMakerQuantity, goodOrderId;

    beforeAll(async () => {
      takerAsset = weth.options.address;
      takerQuantity = toWei('0.01', 'ether');

      badMakerAsset = knc.options.address;
      const badMakerToWethAssetRate = new BN(
        (await call(priceSource, 'getLiveRate', [badMakerAsset, weth.options.address]))[0]
      );
      badMakerQuantity = BNExpDiv(
        new BN(takerQuantity),
        badMakerToWethAssetRate
      ).toString();

      goodMakerAsset = zrx.options.address;
      const goodMakerToWethAssetRate = new BN(
        (await call(priceSource, 'getLiveRate', [goodMakerAsset, weth.options.address]))[0]
      );
      goodMakerQuantity = BNExpDiv(
        new BN(takerQuantity),
        goodMakerToWethAssetRate
      ).toString();
    });

    test('Third party makes an order', async () => {
      await send(knc, 'approve', [oasisDexExchange.options.address, badMakerQuantity], defaultTxOpts);
      const res = await send(
        oasisDexExchange,
        'offer',
        [
          badMakerQuantity, badMakerAsset, takerQuantity, takerAsset, 0
        ],
        defaultTxOpts
      );

      const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
      badOrderId = logMake.id;
    });

    test('Bad take order: non-whitelisted maker asset', async () => {
      const { vault } = fund;

      const encodedArgs = encodeOasisDexTakeOrderArgs({
        makerAsset: badMakerAsset,
        makerQuantity: badMakerQuantity,
        takerAsset,
        takerQuantity,
        orderId: badOrderId,
      });

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            oasisDexAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts,
        )
      ).rejects.toThrowFlexible('Rule evaluated to false: ASSET_WHITELIST');
    });

    test('Third party makes an order', async () => {
      const makerToWethAssetRate = new BN(
        (await call(priceSource, 'getLiveRate', [goodMakerAsset, weth.options.address]))[0]
      );
      goodMakerQuantity = BNExpDiv(
        new BN(takerQuantity),
        makerToWethAssetRate
      ).toString();

      await send(zrx, 'approve', [oasisDexExchange.options.address, goodMakerQuantity], defaultTxOpts);
      const res = await send(
        oasisDexExchange,
        'offer',
        [
          goodMakerQuantity, goodMakerAsset, takerQuantity, takerAsset, 0
        ],
        defaultTxOpts
      );

      const logMake = getEventFromLogs(res.logs, CONTRACT_NAMES.OASIS_DEX_EXCHANGE, 'LogMake');
      goodOrderId = logMake.id;
    });

    test('Good take order: whitelisted maker asset', async () => {
      const { vault } = fund;

      const encodedArgs = encodeOasisDexTakeOrderArgs({
        makerAsset: goodMakerAsset,
        makerQuantity: goodMakerQuantity,
        takerAsset,
        takerQuantity,
        orderId: goodOrderId,
      });

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            oasisDexAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts,
        )
      ).resolves.not.toThrow();
    });
  });

  describe('Max positions', () => {
    let takerAsset, takerQuantity;
    let goodMakerAsset1, goodMakerQuantity1, goodOrderId1;
    let goodMakerAsset2, goodMakerQuantity2, goodOrderId2;
    let badMakerAsset, badMakerQuantity, badOrderId;

    beforeAll(async () => {
      takerAsset = weth.options.address;
      takerQuantity = toWei('0.01', 'ether');

      goodMakerAsset1 = mln.options.address;
      const makerToWethAssetRate1 = new BN(
        (await call(priceSource, 'getLiveRate', [goodMakerAsset1, weth.options.address]))[0]
      );
      goodMakerQuantity1 = BNExpDiv(
        new BN(takerQuantity),
        makerToWethAssetRate1
      ).toString();

      goodMakerAsset2 = mln.options.address;
      const makerToWethAssetRate2 = new BN(
        (await call(priceSource, 'getLiveRate', [goodMakerAsset2, weth.options.address]))[0]
      );
      goodMakerQuantity2 = BNExpDiv(
        new BN(takerQuantity),
        makerToWethAssetRate2
      ).toString();

      badMakerAsset = dai.options.address;
      const makerToWethAssetRate3 = new BN(
        (await call(priceSource, 'getLiveRate', [badMakerAsset, weth.options.address]))[0]
      );
      badMakerQuantity = BNExpDiv(
        new BN(takerQuantity),
        new BN(makerToWethAssetRate3)
      ).toString();
    });

    test('Third party makes an order', async () => {
      await send(mln, 'approve', [oasisDexExchange.options.address, goodMakerQuantity1], defaultTxOpts);
      const receipt = await send(
        oasisDexExchange,
        'offer',
        [goodMakerQuantity1, goodMakerAsset1, takerQuantity, takerAsset, 0],
        defaultTxOpts
      );
      const logMake = getEventFromLogs(
        receipt.logs,
        CONTRACT_NAMES.OASIS_DEX_EXCHANGE,
        'LogMake'
      );
      goodOrderId1 = logMake.id;
    });

    test('Good take order 1: final allowed position', async () => {
      const { vault } = fund;

      const maxPositionsVal = await call(
        maxPositions,
        'policyManagerToMaxPositions',
        [fund.policyManager.options.address]
      );

      const preOwnedAssetsLength = (await call(vault, 'getOwnedAssets')).length;
      expect(Number(preOwnedAssetsLength)).toEqual(Number(maxPositionsVal) - 1);

      const encodedArgs = encodeOasisDexTakeOrderArgs({
        makerAsset: goodMakerAsset1,
        makerQuantity: goodMakerQuantity1,
        takerAsset,
        takerQuantity,
        orderId: goodOrderId1,
      });

      await send(
        vault,
        'callOnIntegration',
        [
          oasisDexAdapter.options.address,
          takeOrderFunctionSig,
          encodedArgs,
        ],
        managerTxOpts,
      );

      const postOwnedAssetsLength = (await call(vault, 'getOwnedAssets')).length;
      expect(postOwnedAssetsLength).toEqual(Number(maxPositionsVal));
    });

    test('Third party makes an order', async () => {
      await send(dai, 'approve', [oasisDexExchange.options.address, badMakerQuantity], defaultTxOpts);
      const receipt = await send(
        oasisDexExchange,
        'offer',
        [badMakerQuantity, badMakerAsset, takerQuantity, takerAsset, 0],
        defaultTxOpts
      );
      const logMake = getEventFromLogs(
        receipt.logs,
        CONTRACT_NAMES.OASIS_DEX_EXCHANGE,
        'LogMake'
      );
      badOrderId = logMake.id;
    });

    test('Bad take order: over limit for positions', async () => {
      const { vault } = fund;

      const encodedArgs = encodeOasisDexTakeOrderArgs({
        makerAsset: badMakerAsset,
        makerQuantity: badMakerQuantity,
        takerAsset,
        takerQuantity,
        orderId: badOrderId,
      });

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            oasisDexAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts,
        )
      ).rejects.toThrowFlexible('Rule evaluated to false: MAX_POSITIONS');
    });

    test('Third party makes an order', async () => {
      await send(mln, 'approve', [oasisDexExchange.options.address, goodMakerQuantity2], defaultTxOpts);
      const receipt = await send(
        oasisDexExchange,
        'offer',
        [goodMakerQuantity2, goodMakerAsset1, takerQuantity, takerAsset, 0],
        defaultTxOpts
      );
      const logMake = getEventFromLogs(
        receipt.logs,
        CONTRACT_NAMES.OASIS_DEX_EXCHANGE,
        'LogMake'
      );
      goodOrderId2 = logMake.id;
    });

    test('Good make order 2: add to current position', async () => {
      const { vault } = fund;

      const encodedArgs = encodeOasisDexTakeOrderArgs({
        makerAsset: goodMakerAsset2,
        makerQuantity: goodMakerQuantity2,
        takerAsset,
        takerQuantity,
        orderId: goodOrderId2,
      });

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            oasisDexAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts,
        )
      ).resolves.not.toThrowFlexible();
    });
 });
});
