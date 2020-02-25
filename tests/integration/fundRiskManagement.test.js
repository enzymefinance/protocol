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

import { encodeFunctionSignature } from 'web3-eth-abi';
import { BN, hexToNumber, toWei } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, deploy, send } from '~/deploy/utils/deploy-contract';
import { BNExpMul, BNExpDiv } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { setupInvestedTestFund } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import {
  getEventFromLogs,
  getFunctionSignature
} from '~/tests/utils/metadata';

let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let takeOrderFunctionSig;
let dai, knc, mln, weth, zrx, oasisDexExchange, oasisDexAdapter, priceSource, priceTolerance;
let contracts;
// let wethRateConstant, wethToDaiRate, wethToKncRate, wethToMlnRate, wethToZrxRate;

const ruleFailureString = 'Rule evaluated to false: ';

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  contracts = deployed.contracts;

  dai = contracts.DAI;
  knc = contracts.KNC;
  mln = contracts.MLN;
  weth = contracts.WETH;
  zrx = contracts.ZRX;

  oasisDexExchange = contracts.OasisDexExchange;
  oasisDexAdapter = contracts.OasisDexAdapter;
  priceSource = contracts.TestingPriceFeed;
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
 * Max positions: current number of fund positions + 1
 * Price tolerance: deployment price tolerance contract
 */
describe('Fund 1: Asset blacklist, price tolerance, max positions, max concentration', () => {
  let fund;
  let assetBlacklist, maxConcentration, maxPositions;
  let priceToleranceVal, maxConcentrationVal;
  let oasisDexExchangeIndex;

  beforeAll(async () => {
    fund = await setupInvestedTestFund(contracts, manager);
    const { accounting, policyManager, trading } = fund;

    const exchangeInfo = await call(trading, 'getExchangeInfo');
    oasisDexExchangeIndex = exchangeInfo[1].findIndex(
      e => e.toLowerCase() === oasisDexAdapter.options.address.toLowerCase(),
    );

    assetBlacklist = await deploy(
      CONTRACT_NAMES.ASSET_BLACKLIST,
      [[knc.options.address]]
    );
    const currentPositions = await call(accounting, 'getOwnedAssetsLength');
    maxPositions = await deploy(
      CONTRACT_NAMES.MAX_POSITIONS,
      [Number(currentPositions) + 2]
    );
    maxConcentration = await deploy(
      CONTRACT_NAMES.MAX_CONCENTRATION,
      [toWei('0.1', 'ether')],
    );

    await send(
      policyManager,
      'register',
      [
        encodeFunctionSignature(takeOrderFunctionSig),
        priceTolerance.options.address
      ],
      managerTxOpts
    );
    await send(
      policyManager,
      'register',
      [
        encodeFunctionSignature(takeOrderFunctionSig),
        assetBlacklist.options.address
      ],
      managerTxOpts
    );
    await send(
      policyManager,
      'register',
      [
        encodeFunctionSignature(takeOrderFunctionSig),
        maxPositions.options.address
      ],
      managerTxOpts
    );
    await send(
      policyManager,
      'register',
      [
        encodeFunctionSignature(takeOrderFunctionSig),
        maxConcentration.options.address
      ],
      managerTxOpts
    );

    maxConcentrationVal = await call(maxConcentration, 'maxConcentration');
    priceToleranceVal = await call(priceTolerance, 'tolerance');
  });

  test('Confirm policies have been set', async () => {
    const { policyManager } = fund;

    const takeOrderPoliciesRes = await call(
      policyManager,
      'getPoliciesBySig',
      [encodeFunctionSignature(takeOrderFunctionSig)]
    );
    const takeOrderPolicyAddresses = [
      ...takeOrderPoliciesRes[0],
      ...takeOrderPoliciesRes[1]
    ];

    expect(
      takeOrderPolicyAddresses.includes(priceTolerance.options.address)
    ).toBe(true);
    expect(
      takeOrderPolicyAddresses.includes(maxPositions.options.address)
    ).toBe(true);
    expect(
      takeOrderPolicyAddresses.includes(assetBlacklist.options.address)
    ).toBe(true);
    expect(
      takeOrderPolicyAddresses.includes(maxConcentration.options.address)
    ).toBe(true);
  });

  describe('Asset blacklist', () => {
    let goodMakerAsset, goodMakerQuantity, takerAsset, takerQuantity;
    let goodOrderId;

    beforeAll(async () => {
      takerAsset = weth.options.address;
      takerQuantity = toWei('0.01', 'ether');
      goodMakerAsset = mln.options.address;
    });

    test('Bad take order: blacklisted maker asset', async () => {
      const { trading } = fund;

      const makerAsset = knc.options.address;
      const wethToMakerAssetRate = new BN(
        (await call(priceSource, 'getPrice', [makerAsset]))[0]
      );
      const makerQuantity = BNExpDiv(
        new BN(takerQuantity),
        wethToMakerAssetRate
      ).toString();

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            oasisDexExchangeIndex,
            takeOrderFunctionSig,
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
        )
      ).rejects.toThrowFlexible(`${ruleFailureString}AssetBlacklist`);
    });

    test('Third party makes an order', async () => {
      const makerToWethAssetRate = new BN(
        (await call(priceSource, 'getPrice', [goodMakerAsset]))[0]
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
      const { trading } = fund;

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            oasisDexExchangeIndex,
            takeOrderFunctionSig,
            [
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              goodMakerAsset,
              takerAsset,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS
            ],
            [goodMakerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
            ['0x0', '0x0', '0x0', '0x0'],
            goodOrderId,
            '0x0',
          ],
          managerTxOpts
        )
      ).resolves.not.toThrow();
    });
  });

  describe('Price tolerance', () => {
    let makerAsset, takerAsset, takerQuantity;
    let expectedMakerQuantity, toleratedMakerQuantity;
    let makerQuantityPercentLimit, makerQuantityPercentShift;
    let goodOrderId;

    beforeAll(async () => {
      makerAsset = mln.options.address;
      takerAsset = weth.options.address;
      takerQuantity = toWei('0.01', 'ether');

      const makerToWethAssetRate = new BN(
        (await call(priceSource, 'getPrice', [makerAsset]))[0]
      );
      expectedMakerQuantity = BNExpDiv(
        new BN(takerQuantity),
        makerToWethAssetRate
      ).toString();

      makerQuantityPercentLimit =
        new BN(toWei('1', 'ether')).sub(new BN(priceToleranceVal));
      makerQuantityPercentShift = new BN(toWei('0.01', 'ether')); // 1%
    });

    test('Bad take order: slippage just above limit', async () => {
      const { trading } = fund;

      const badMakerQuantity = BNExpMul(
        new BN(expectedMakerQuantity),
        makerQuantityPercentLimit.sub(makerQuantityPercentShift)
      ).toString();

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            oasisDexExchangeIndex,
            takeOrderFunctionSig,
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
            [badMakerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
            ['0x0', '0x0', '0x0', '0x0'],
            '0x0',
            '0x0',
          ],
          managerTxOpts
        )
      ).rejects.toThrowFlexible(`${ruleFailureString}PriceTolerance`);
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
      const { trading } = fund;

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            oasisDexExchangeIndex,
            takeOrderFunctionSig,
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
            [toleratedMakerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
            ['0x0', '0x0', '0x0', '0x0'],
            goodOrderId,
            '0x0',
          ],
          managerTxOpts
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
      const { accounting } = fund;
      makerAsset = dai.options.address;
      takerAsset = weth.options.address;
      makerToWethAssetRate = new BN(
        (await call(priceSource, 'getPrice', [makerAsset]))[0]
      );

      const makerAssetGav = new BN(
        await call(accounting, 'calcAssetGav', [makerAsset])
      );
      const fundGav = new BN(await call(accounting, 'calcGav'));
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
      const { trading } = fund;

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            oasisDexExchangeIndex,
            takeOrderFunctionSig,
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
            [goodMakerQuantity, goodTakerQuantity, 0, 0, 0, 0, goodTakerQuantity, 0],
            ['0x0', '0x0', '0x0', '0x0'],
            goodOrderId,
            '0x0',
          ],
          managerTxOpts
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
      const { trading } = fund;

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            oasisDexExchangeIndex,
            takeOrderFunctionSig,
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
            [badMakerQuantity, badTakerQuantity, 0, 0, 0, 0, badTakerQuantity, 0],
            ['0x0', '0x0', '0x0', '0x0'],
            badOrderId,
            '0x0',
          ],
          managerTxOpts
        )
      ).rejects.toThrowFlexible(`${ruleFailureString}MaxConcentration`);
    });
  });
});

/*
 * Fund #2: Trading on Oasis Dex
 * Asset whitelist: DAI, MLN, ZRX
 * Max positions: current number of fund positions + 1
 */
describe('Fund 2: Asset whitelist, max positions', () => {
  let fund;
  let assetWhitelist, maxPositions;
  let oasisDexExchangeIndex;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION], true);
    contracts = deployed.contracts;

    fund = await setupInvestedTestFund(contracts, manager);
    const { accounting, policyManager, trading } = fund;

    const exchangeInfo = await call(trading, 'getExchangeInfo');
    oasisDexExchangeIndex = exchangeInfo[1].findIndex(
      e => e.toLowerCase() === oasisDexAdapter.options.address.toLowerCase(),
    );

    assetWhitelist = await deploy(
      CONTRACT_NAMES.ASSET_WHITELIST,
      [[dai.options.address, mln.options.address, zrx.options.address]]
    );
    const currentPositions = await call(accounting, 'getOwnedAssetsLength');
    const maxPositionsArg = Number(currentPositions) + 2;
    maxPositions = await deploy(
      CONTRACT_NAMES.MAX_POSITIONS,
      [maxPositionsArg]
    );

    await send(
      policyManager,
      'register',
      [
        encodeFunctionSignature(takeOrderFunctionSig),
        assetWhitelist.options.address
      ],
      managerTxOpts
    );
    await send(
      policyManager,
      'register',
      [
        encodeFunctionSignature(takeOrderFunctionSig),
        maxPositions.options.address
      ],
      managerTxOpts
    );
  });

  test('Confirm policies have been set', async () => {
    const { policyManager } = fund;
    const takeOrderPoliciesRes = await call(
      policyManager,
      'getPoliciesBySig',
      [encodeFunctionSignature(takeOrderFunctionSig)]
    );
    const takeOrderPolicyAddresses = [
      ...takeOrderPoliciesRes[0],
      ...takeOrderPoliciesRes[1]
    ];

    expect(
      takeOrderPolicyAddresses.includes(maxPositions.options.address)
    ).toBe(true);
    expect(
      takeOrderPolicyAddresses.includes(assetWhitelist.options.address)
    ).toBe(true);
  });

  describe('Asset whitelist', () => {
    let takerAsset, takerQuantity;
    let goodMakerAsset, goodMakerQuantity, goodOrderId;

    beforeAll(async () => {
      takerAsset = weth.options.address;
      takerQuantity = toWei('0.01', 'ether');

      goodMakerAsset = zrx.options.address;
      const makerToWethAssetRate = new BN(
        (await call(priceSource, 'getPrice', [goodMakerAsset]))[0]
      );
      goodMakerQuantity = BNExpDiv(
        new BN(takerQuantity),
        makerToWethAssetRate
      ).toString();
    });

    test('Bad take order: non-whitelisted maker asset', async () => {
      const { trading } = fund;

      const badMakerAsset = knc.options.address;
      const makerToWethAssetRate = new BN(
        (await call(priceSource, 'getPrice', [badMakerAsset]))[0]
      );
      const makerQuantity = BNExpDiv(
        new BN(takerQuantity),
        makerToWethAssetRate
      ).toString();

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            oasisDexExchangeIndex,
            takeOrderFunctionSig,
            [
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              badMakerAsset,
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
        )
      ).rejects.toThrowFlexible(`${ruleFailureString}AssetWhitelist`);
    });

    test('Third party makes an order', async () => {
      const makerToWethAssetRate = new BN(
        (await call(priceSource, 'getPrice', [goodMakerAsset]))[0]
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
      const { trading } = fund;

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            oasisDexExchangeIndex,
            takeOrderFunctionSig,
            [
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              goodMakerAsset,
              takerAsset,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS
            ],
            [goodMakerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
            ['0x0', '0x0', '0x0', '0x0'],
            goodOrderId,
            '0x0',
          ],
          managerTxOpts
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
        (await call(priceSource, 'getPrice', [goodMakerAsset1]))[0]
      );
      goodMakerQuantity1 = BNExpDiv(
        new BN(takerQuantity),
        makerToWethAssetRate1
      ).toString();

      goodMakerAsset2 = mln.options.address;
      const makerToWethAssetRate2 = new BN(
        (await call(priceSource, 'getPrice', [goodMakerAsset2]))[0]
      );
      goodMakerQuantity2 = BNExpDiv(
        new BN(takerQuantity),
        makerToWethAssetRate2
      ).toString();

      badMakerAsset = dai.options.address;
      const makerToWethAssetRate3 = new BN(
        (await call(priceSource, 'getPrice', [badMakerAsset]))[0]
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
      const { accounting, trading } = fund;

      const maxPositionsVal = await call(maxPositions, 'maxPositions');

      const preOwnedAssetsLength = await call(accounting, 'getOwnedAssetsLength');
      expect(Number(preOwnedAssetsLength)).toEqual(Number(maxPositionsVal) - 1);

      await send(
        trading,
        'callOnExchange',
        [
          oasisDexExchangeIndex,
          takeOrderFunctionSig,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            goodMakerAsset1,
            takerAsset,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [goodMakerQuantity1, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          goodOrderId1,
          '0x0',
        ],
        managerTxOpts
      );

      const postOwnedAssetsLength = await call(accounting, 'getOwnedAssetsLength');
      expect(postOwnedAssetsLength).toEqual(maxPositionsVal);
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
      const { trading } = fund;

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            oasisDexExchangeIndex,
            takeOrderFunctionSig,
            [
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              badMakerAsset,
              takerAsset,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS
            ],
            [badMakerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
            ['0x0', '0x0', '0x0', '0x0'],
            badOrderId,
            '0x0',
          ],
          managerTxOpts
        )
      ).rejects.toThrowFlexible(`${ruleFailureString}MaxPositions`);
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
      const { trading } = fund;

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            oasisDexExchangeIndex,
            takeOrderFunctionSig,
            [
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              goodMakerAsset2,
              takerAsset,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS
            ],
            [goodMakerQuantity2, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
            ['0x0', '0x0', '0x0', '0x0'],
            goodOrderId2,
            '0x0',
          ],
          managerTxOpts
        )
      ).resolves.not.toThrowFlexible();
    });
  });
});
