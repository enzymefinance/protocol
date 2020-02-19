/*
 * @file Tests a fund's risk management policies in executing trades
 *
 * @test Fund policies are set
 * @test A fund can only make an order for a non-blacklisted asset
 * @test A fund can only make an order with a tolerable amount of price slippage
 * @test A fund cannot make an order with an asset AFTER it has exceeded its max concentration
 * @test A fund can only make an order for a whitelisted asset
 * @test A fund can only make an order for its current assets once max positions is reached
 * @test TODO: Take orders
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
import { increaseTime, mine } from '~/tests/utils/rpc';

let deployer, manager1, manager2, investor;
let defaultTxOpts, investorTxOpts;
let makeOrderFunctionSig, takeOrderFunctionSig;
let dai, knc, mln, weth, zrx, oasisDex, oasisDexAdapter, priceSource, priceTolerance;
let contracts;

const ruleFailureString = 'Rule evaluated to false: ';

beforeAll(async () => {
  [deployer, manager1, manager2, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  contracts = deployed.contracts;

  makeOrderFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'makeOrder',
  );
  takeOrderFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.EXCHANGE_ADAPTER,
    'takeOrder',
  );

  dai = contracts.DAI;
  knc = contracts.KNC;
  mln = contracts.MLN;
  weth = contracts.WETH;
  zrx = contracts.ZRX;

  oasisDex = contracts.OasisDexExchange;
  oasisDexAdapter = contracts.OasisDexAdapter;
  priceSource = contracts.TestingPriceFeed;
  priceTolerance = contracts.PriceTolerance;

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
 * Fund #1: Trading on Oasis Dex
 * Asset blacklist: KNC
 * Max concentration: 10%
 * Max positions: current number of fund positions + 1
 * Price tolerance: deployment price tolerance contract
 */
describe('Fund 1: Asset blacklist, price tolerance, max positions, max concentration', () => {
  let fund;
  let manager, managerTxOpts;
  let assetBlacklist, maxConcentration, maxPositions;
  let priceToleranceVal, maxConcentrationVal;
  let oasisDexExchangeIndex;

  beforeAll(async () => {
    manager = manager1;
    managerTxOpts = { ...defaultTxOpts, from: manager };

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
        encodeFunctionSignature(makeOrderFunctionSig),
        priceTolerance.options.address
      ],
      managerTxOpts
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
        encodeFunctionSignature(makeOrderFunctionSig),
        assetBlacklist.options.address
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
        encodeFunctionSignature(makeOrderFunctionSig),
        maxPositions.options.address
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
        encodeFunctionSignature(makeOrderFunctionSig),
        maxConcentration.options.address
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

    const makeOrderPoliciesRes = await call(
      policyManager,
      'getPoliciesBySig',
      [encodeFunctionSignature(makeOrderFunctionSig)]
    );
    const makeOrderPolicyAddresses = [
      ...makeOrderPoliciesRes[0],
      ...makeOrderPoliciesRes[1]
    ];
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
      makeOrderPolicyAddresses.includes(priceTolerance.options.address)
    ).toBe(true);
    expect(
      makeOrderPolicyAddresses.includes(maxPositions.options.address)
    ).toBe(true);
    expect(
      makeOrderPolicyAddresses.includes(assetBlacklist.options.address)
    ).toBe(true);
    expect(
      makeOrderPolicyAddresses.includes(maxConcentration.options.address)
    ).toBe(true);

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
    let makerAsset, makerQuantity;

    beforeAll(async () => {
      makerAsset = weth.options.address;
      makerQuantity = toWei('0.01', 'ether');
    });

    test('Bad make order: blacklisted taker asset', async () => {
      const { trading } = fund;

      const takerAsset = knc.options.address;
      const wethToTakerAssetRate = new BN(
        (await call(priceSource, 'getPrice', [takerAsset]))[0]
      );
      const takerQuantity = BNExpDiv(
        new BN(makerQuantity),
        wethToTakerAssetRate
      ).toString();

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            oasisDexExchangeIndex,
            makeOrderFunctionSig,
            [
              trading.options.address,
              EMPTY_ADDRESS,
              makerAsset,
              takerAsset,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS
            ],
            [makerQuantity, takerQuantity, 0, 0, 0, 0, 0, 0],
            ['0x0', '0x0', '0x0', '0x0'],
            '0x0',
            '0x0',
          ],
          managerTxOpts
        )
      ).rejects.toThrowFlexible(`${ruleFailureString}AssetBlacklist`);
    });

    test('Good maker order: non-blacklisted taker asset', async () => {
      const { accounting, trading } = fund;

      const takerAsset = mln.options.address;
      const wethToTakerAssetRate = new BN(
        (await call(priceSource, 'getPrice', [takerAsset]))[0]
      );
      const takerQuantity = BNExpDiv(
        new BN(makerQuantity),
        wethToTakerAssetRate
      ).toString();

      const receipt = await send(
        trading,
        'callOnExchange',
        [
          oasisDexExchangeIndex,
          makeOrderFunctionSig,
          [
            trading.options.address,
            EMPTY_ADDRESS,
            makerAsset,
            takerAsset,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, 0, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        ],
        managerTxOpts
      );

      // Take order with EOA
      const logMake = getEventFromLogs(
        receipt.logs,
        CONTRACT_NAMES.OASIS_DEX_EXCHANGE,
        'LogMake'
      );
      const orderId = hexToNumber(logMake.id);
      await send(mln, 'transfer', [investor, takerQuantity], defaultTxOpts);
      await send(
        mln,
        'approve',
        [oasisDex.options.address, takerQuantity],
        investorTxOpts
      );
      await send(oasisDex, 'buy', [orderId, makerQuantity], investorTxOpts);

      // Update accounting so maker asset is no longer marked as in an open order
      await send(accounting, 'updateOwnedAssets', [], managerTxOpts);
      await send(trading, 'returnAssetToVault', [takerAsset], managerTxOpts);
      await send(trading, 'updateAndGetQuantityBeingTraded', [makerAsset], managerTxOpts);

      const isInOpenMakeOrder = await call(trading, 'isInOpenMakeOrder', [makerAsset]);
      expect(isInOpenMakeOrder).toEqual(false);

      // Increment next block time past the maker asset cooldown period
      const cooldownTime = await call(trading, 'MAKE_ORDER_COOLDOWN');
      await increaseTime(cooldownTime*2);
      await mine();
    });
  });

  describe('Price tolerance', () => {
    let makerAsset, makerQuantity, takerAsset;
    let expectedTakerQuantity;
    let takerQuantityPercentLimit, takerQuantityPercentShift;

    beforeAll(async () => {
      makerAsset = weth.options.address;
      makerQuantity = toWei('0.01', 'ether');
      takerAsset = mln.options.address;

      const wethToTakerAssetRate = new BN(
        (await call(priceSource, 'getPrice', [takerAsset]))[0]
      );
      expectedTakerQuantity = BNExpDiv(
        new BN(makerQuantity),
        wethToTakerAssetRate
      ).toString();

      takerQuantityPercentLimit =
        new BN(toWei('1', 'ether')).sub(new BN(priceToleranceVal));
      takerQuantityPercentShift = new BN(toWei('0.01', 'ether')); // 1%
    });

    test('Bad make order: slippage just above limit', async () => {
      const { trading } = fund;

      const badTakerQuantity = BNExpMul(
        new BN(expectedTakerQuantity),
        takerQuantityPercentLimit.sub(takerQuantityPercentShift)
      ).toString();

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            oasisDexExchangeIndex,
            makeOrderFunctionSig,
            [
              trading.options.address,
              EMPTY_ADDRESS,
              makerAsset,
              takerAsset,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS
            ],
            [makerQuantity, badTakerQuantity, 0, 0, 0, 0, 0, 0],
            ['0x0', '0x0', '0x0', '0x0'],
            '0x0',
            '0x0',
          ],
          managerTxOpts
        )
      ).rejects.toThrowFlexible(`${ruleFailureString}PriceTolerance`);
    });
    test('Good make order: slippage just within limit', async () => {
      const { accounting, trading } = fund;

      const toleratedTakerQuantity = BNExpMul(
        new BN(expectedTakerQuantity),
        takerQuantityPercentLimit.add(takerQuantityPercentShift)
      ).toString();

      const receipt = await send(
        trading,
        'callOnExchange',
        [
          oasisDexExchangeIndex,
          makeOrderFunctionSig,
          [
            trading.options.address,
            EMPTY_ADDRESS,
            makerAsset,
            takerAsset,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [makerQuantity, toleratedTakerQuantity, 0, 0, 0, 0, 0, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        ],
        managerTxOpts
      );

      // Take order with EOA
      const logMake = getEventFromLogs(
        receipt.logs,
        CONTRACT_NAMES.OASIS_DEX_EXCHANGE,
        'LogMake'
      );
      const orderId = hexToNumber(logMake.id);
      await send(mln, 'transfer', [investor, toleratedTakerQuantity], defaultTxOpts);
      await send(
        mln,
        'approve',
        [oasisDex.options.address, toleratedTakerQuantity],
        investorTxOpts
      );
      await send(oasisDex, 'buy', [orderId, makerQuantity], investorTxOpts);

      // Update accounting so maker asset is no longer marked as in an open order
      await send(accounting, 'updateOwnedAssets', [], managerTxOpts);
      await send(trading, 'returnAssetToVault', [takerAsset], managerTxOpts);
      await send(trading, 'updateAndGetQuantityBeingTraded', [makerAsset], managerTxOpts);

      const isInOpenMakeOrder = await call(trading, 'isInOpenMakeOrder', [makerAsset]);
      expect(isInOpenMakeOrder).toEqual(false);

      // Increment next block time past the maker asset cooldown period
      const cooldownTime = await call(trading, 'MAKE_ORDER_COOLDOWN');
      await increaseTime(cooldownTime*2);
      await mine();
    });
  });

  describe('Max concentration', () => {
    let makerAsset, takerAsset;
    let wethToTakerAssetRate;

    beforeAll(async () => {
      makerAsset = weth.options.address;
      takerAsset = dai.options.address;
      wethToTakerAssetRate = new BN(
        (await call(priceSource, 'getPrice', [takerAsset]))[0]
      );
    });

    test('Good make order: just under max-concentration', async () => {
      const { accounting, trading } = fund;

      const takerAssetGav = new BN(
        await call(accounting, 'calcAssetGAV', [takerAsset])
      );
      const fundGav = new BN(await call(accounting, 'calcGav'));
      const takerAssetGavPercent = BNExpDiv(takerAssetGav, fundGav);
      const allowedTakerAssetGavPercentage =
        new BN(maxConcentrationVal).sub(takerAssetGavPercent);

      const percentageShift = new BN(toWei('0.01', 'ether')); // 1%

      const makerQuantity = BNExpMul(
        fundGav,
        allowedTakerAssetGavPercentage.sub(percentageShift)
      ).toString();

      const takerQuantity = BNExpDiv(
        new BN(makerQuantity),
        new BN(wethToTakerAssetRate)
      ).toString();

      const receipt = await send(
        trading,
        'callOnExchange',
        [
          oasisDexExchangeIndex,
          makeOrderFunctionSig,
          [
            trading.options.address,
            EMPTY_ADDRESS,
            makerAsset,
            takerAsset,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, 0, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        ],
        managerTxOpts
      );

      // Take order with EOA
      const logMake = getEventFromLogs(
        receipt.logs,
        CONTRACT_NAMES.OASIS_DEX_EXCHANGE,
        'LogMake'
      );
      const orderId = hexToNumber(logMake.id);
      await send(dai, 'transfer', [investor, takerQuantity], defaultTxOpts);
      await send(
        dai,
        'approve',
        [oasisDex.options.address, takerQuantity],
        investorTxOpts
      );
      await send(oasisDex, 'buy', [orderId, makerQuantity], investorTxOpts);

      // Update accounting so maker asset is no longer marked as in an open order
      await send(accounting, 'updateOwnedAssets', [], managerTxOpts);
      await send(trading, 'returnAssetToVault', [takerAsset], managerTxOpts);
      await send(trading, 'updateAndGetQuantityBeingTraded', [makerAsset], managerTxOpts);

      const isInOpenMakeOrder = await call(trading, 'isInOpenMakeOrder', [makerAsset]);
      expect(isInOpenMakeOrder).toEqual(false);

      // Increment next block time past the maker asset cooldown period
      const cooldownTime = await call(trading, 'MAKE_ORDER_COOLDOWN');
      await increaseTime(cooldownTime*2);
      await mine();
    });

    test('Bad make order: max concentration exceeded', async () => {
      const { trading } = fund;

      const makerQuantity = toWei('0.01', 'ether');
      const takerQuantity = BNExpDiv(
        new BN(makerQuantity),
        wethToTakerAssetRate
      ).toString();

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            oasisDexExchangeIndex,
            makeOrderFunctionSig,
            [
              trading.options.address,
              EMPTY_ADDRESS,
              makerAsset,
              takerAsset,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS
            ],
            [makerQuantity, takerQuantity, 0, 0, 0, 0, 0, 0],
            ['0x0', '0x0', '0x0', '0x0'],
            '0x0',
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
  let manager, managerTxOpts;
  let assetWhitelist, maxPositions;
  let oasisDexExchangeIndex;

  beforeAll(async () => {
    manager = manager2;
    managerTxOpts = { ...defaultTxOpts, from: manager };
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
        encodeFunctionSignature(makeOrderFunctionSig),
        assetWhitelist.options.address
      ],
      managerTxOpts
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
        encodeFunctionSignature(makeOrderFunctionSig),
        maxPositions.options.address
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

    const makeOrderPoliciesRes = await call(
      policyManager,
      'getPoliciesBySig',
      [encodeFunctionSignature(makeOrderFunctionSig)]
    );
    const makeOrderPolicyAddresses = [
      ...makeOrderPoliciesRes[0],
      ...makeOrderPoliciesRes[1]
    ];
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
      makeOrderPolicyAddresses.includes(maxPositions.options.address)
    ).toBe(true);
    expect(
      makeOrderPolicyAddresses.includes(assetWhitelist.options.address)
    ).toBe(true);
    expect(
      takeOrderPolicyAddresses.includes(maxPositions.options.address)
    ).toBe(true);
    expect(
      takeOrderPolicyAddresses.includes(assetWhitelist.options.address)
    ).toBe(true);
  });

  describe('Asset whitelist', () => {
    let makerAsset, makerQuantity;

    beforeAll(async () => {
      makerAsset = weth.options.address;
      makerQuantity = toWei('0.01', 'ether');
    });

    test('Bad make order: non-whitelisted taker asset', async () => {
      const { trading } = fund;

      const takerAsset = knc.options.address;
      const wethToTakerAssetRate = new BN(
        (await call(priceSource, 'getPrice', [takerAsset]))[0]
      );
      const takerQuantity = BNExpDiv(
        new BN(makerQuantity),
        wethToTakerAssetRate
      ).toString();

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            oasisDexExchangeIndex,
            makeOrderFunctionSig,
            [
              trading.options.address,
              EMPTY_ADDRESS,
              makerAsset,
              takerAsset,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS
            ],
            [makerQuantity, takerQuantity, 0, 0, 0, 0, 0, 0],
            ['0x0', '0x0', '0x0', '0x0'],
            '0x0',
            '0x0',
          ],
          managerTxOpts
        )
      ).rejects.toThrowFlexible(`${ruleFailureString}AssetWhitelist`);
    });

    test('Good make order: whitelisted taker asset', async () => {
      const { accounting, trading } = fund;

      const takerAsset = zrx.options.address;
      const wethToTakerAssetRate = new BN(
        (await call(priceSource, 'getPrice', [takerAsset]))[0]
      );
      const takerQuantity = BNExpDiv(
        new BN(makerQuantity),
        wethToTakerAssetRate
      ).toString();

      const receipt = await send(
        trading,
        'callOnExchange',
        [
          oasisDexExchangeIndex,
          makeOrderFunctionSig,
          [
            trading.options.address,
            EMPTY_ADDRESS,
            makerAsset,
            takerAsset,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, 0, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        ],
        managerTxOpts
      );

      // Take order with EOA
      const logMake = getEventFromLogs(
        receipt.logs,
        CONTRACT_NAMES.OASIS_DEX_EXCHANGE,
        'LogMake'
      );
      const orderId = hexToNumber(logMake.id);
      await send(zrx, 'transfer', [investor, takerQuantity], defaultTxOpts);
      await send(
        zrx,
        'approve',
        [oasisDex.options.address, takerQuantity],
        investorTxOpts
      );
      await send(oasisDex, 'buy', [orderId, makerQuantity], investorTxOpts);

      // Update accounting so maker asset is no longer marked as in an open order
      await send(accounting, 'updateOwnedAssets', [], managerTxOpts);
      await send(trading, 'returnAssetToVault', [takerAsset], managerTxOpts);
      await send(trading, 'updateAndGetQuantityBeingTraded', [makerAsset], managerTxOpts);

      const isInOpenMakeOrder = await call(trading, 'isInOpenMakeOrder', [makerAsset]);
      expect(isInOpenMakeOrder).toEqual(false);

      // Increment next block time past the maker asset cooldown period
      const cooldownTime = await call(trading, 'MAKE_ORDER_COOLDOWN');
      await increaseTime(cooldownTime*2);
      await mine();
    });
  });

  describe('Max positions', () => {
    test('Good take order: final allowed position', async () => {
      const { accounting, trading } = fund;

      const maxPositionsVal = await call(maxPositions, 'maxPositions');

      const preOwnedAssetsLength = await call(accounting, 'getOwnedAssetsLength');
      expect(Number(preOwnedAssetsLength)).toEqual(Number(maxPositionsVal) - 1);

      const takerAsset = weth.options.address;
      const takerQuantity = toWei('0.01', 'ether');
      const makerAsset = mln.options.address;
      const wethToMakerAssetRate = new BN(
        (await call(priceSource, 'getPrice', [makerAsset]))[0]
      );
      const makerQuantity = BNExpDiv(
        new BN(takerQuantity),
        new BN(wethToMakerAssetRate)
      ).toString();

      await send(mln, 'transfer', [investor, makerQuantity], defaultTxOpts);
      await send(mln, 'approve', [oasisDex.options.address, makerQuantity], investorTxOpts);
      const receipt = await send(
        oasisDex,
        'offer',
        [makerQuantity, makerAsset, takerQuantity, takerAsset, 0],
        investorTxOpts
      );
      const logMake = getEventFromLogs(
        receipt.logs,
        CONTRACT_NAMES.OASIS_DEX_EXCHANGE,
        'LogMake'
      );
      const orderIdHex = logMake.id;

      await send(
        trading,
        'callOnExchange',
        [
          oasisDexExchangeIndex,
          takeOrderFunctionSig,
          [
            investor,
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
          orderIdHex,
          '0x0',
        ],
        managerTxOpts
      );

      const postOwnedAssetsLength = await call(accounting, 'getOwnedAssetsLength');
      expect(postOwnedAssetsLength).toEqual(maxPositionsVal);
    });

    test('Bad make order: over limit for positions', async () => {
      const { trading } = fund;

      const makerAsset = weth.options.address;
      const makerQuantity = toWei('0.01', 'ether');
      const takerAsset = dai.options.address;
      const wethToTakerAssetRate = new BN(
        (await call(priceSource, 'getPrice', [takerAsset]))[0]
      );
      const takerQuantity = BNExpDiv(
        new BN(makerQuantity),
        new BN(wethToTakerAssetRate)
      ).toString();

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            oasisDexExchangeIndex,
            makeOrderFunctionSig,
            [
              trading.options.address,
              EMPTY_ADDRESS,
              makerAsset,
              takerAsset,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS
            ],
            [makerQuantity, takerQuantity, 0, 0, 0, 0, 0, 0],
            ['0x0', '0x0', '0x0', '0x0'],
            '0x0',
            '0x0',
          ],
          managerTxOpts
        )
      ).rejects.toThrowFlexible(`${ruleFailureString}MaxPositions`);
    });

    test('Good make order: add to current position', async () => {
      const { trading } = fund;

      const makerAsset = weth.options.address;
      const makerQuantity = toWei('0.01', 'ether');
      const takerAsset = zrx.options.address;
      const wethToTakerAssetRate = new BN(
        (await call(priceSource, 'getPrice', [takerAsset]))[0]
      );
      const takerQuantity = BNExpDiv(
        new BN(makerQuantity),
        new BN(wethToTakerAssetRate)
      ).toString();

      await expect(
        send(
          trading,
          'callOnExchange',
          [
            oasisDexExchangeIndex,
            makeOrderFunctionSig,
            [
              trading.options.address,
              EMPTY_ADDRESS,
              makerAsset,
              takerAsset,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS,
              EMPTY_ADDRESS
            ],
            [makerQuantity, takerQuantity, 0, 0, 0, 0, 0, 0],
            ['0x0', '0x0', '0x0', '0x0'],
            '0x0',
            '0x0',
          ],
          managerTxOpts
        )
      ).resolves.not.toThrowFlexible();
    });
  });
});
