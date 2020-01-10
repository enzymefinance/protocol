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
import { deploy } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';
import { BNExpMul, BNExpDiv } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import {
  getEventFromReceipt,
  getFunctionSignature
} from '~/tests/utils/metadata';
import { increaseTime, mine } from '~/tests/utils/rpc';
import setupInvestedTestFund from '~/tests/utils/setupInvestedTestFund';

let deployer, manager1, manager2, investor;
let defaultTxOpts, investorTxOpts;
let makeOrderFunctionSig, takeOrderFunctionSig;
let dai, knc, mln, weth, zrx, oasisDex, oasisDexAdapter, priceSource, priceTolerance;
let contracts;

const ruleFailureString = 'Rule evaluated to false: ';

beforeAll(async () => {
  [deployer, manager1, manager2, investor] = await web3.eth.getAccounts();
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
  await priceSource.methods
    .update(
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
    )
    .send(defaultTxOpts);

  await weth.methods.transfer(manager1, toWei('10', 'ether')).send(defaultTxOpts);
  await weth.methods.transfer(manager2, toWei('10', 'ether')).send(defaultTxOpts);
  await weth.methods.transfer(investor, toWei('10', 'ether')).send(defaultTxOpts);
  await mln.methods.transfer(manager1, toWei('20', 'ether')).send(defaultTxOpts);
  await mln.methods.transfer(manager2, toWei('20', 'ether')).send(defaultTxOpts);
  await mln.methods.transfer(investor, toWei('20', 'ether')).send(defaultTxOpts);
  await dai.methods.transfer(manager1, toWei('2000', 'ether')).send(defaultTxOpts);
  await dai.methods.transfer(manager2, toWei('2000', 'ether')).send(defaultTxOpts);
  await dai.methods.transfer(investor, toWei('2000', 'ether')).send(defaultTxOpts);
  await knc.methods.transfer(manager1, toWei('2000', 'ether')).send(defaultTxOpts);
  await knc.methods.transfer(manager2, toWei('2000', 'ether')).send(defaultTxOpts);
  await knc.methods.transfer(investor, toWei('2000', 'ether')).send(defaultTxOpts);
  await zrx.methods.transfer(manager1, toWei('50', 'ether')).send(defaultTxOpts);
  await zrx.methods.transfer(manager2, toWei('50', 'ether')).send(defaultTxOpts);
  await zrx.methods.transfer(investor, toWei('50', 'ether')).send(defaultTxOpts);
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
  let priceToleranceVal, maxConcentrationVal, maxPositionsVal;
  let oasisDexExchangeIndex;

  beforeAll(async () => {
    manager = manager1;
    managerTxOpts = { ...defaultTxOpts, from: manager };

    fund = await setupInvestedTestFund(contracts, manager);
    const { accounting, policyManager, trading } = fund;

    const exchangeInfo = await trading.methods.getExchangeInfo().call();
    oasisDexExchangeIndex = exchangeInfo[1].findIndex(
      e => e.toLowerCase() === oasisDexAdapter.options.address.toLowerCase(),
    );

    assetBlacklist = await deploy(
      CONTRACT_NAMES.ASSET_BLACKLIST,
      [[knc.options.address]]
    );
    const currentPositions = await accounting.methods.getOwnedAssetsLength().call();
    maxPositions = await deploy(
      CONTRACT_NAMES.MAX_POSITIONS,
      [Number(currentPositions) + 2]
    );
    maxConcentration = await deploy(
      CONTRACT_NAMES.MAX_CONCENTRATION,
      [toWei('0.1', 'ether')],
    );

    await policyManager.methods
      .register(
        encodeFunctionSignature(makeOrderFunctionSig),
        priceTolerance.options.address
      )
      .send(managerTxOpts);
    await policyManager.methods
      .register(
        encodeFunctionSignature(takeOrderFunctionSig),
        priceTolerance.options.address
      )
      .send(managerTxOpts);
    await policyManager.methods
      .register(
        encodeFunctionSignature(makeOrderFunctionSig),
        assetBlacklist.options.address
      )
      .send(managerTxOpts);
    await policyManager.methods
      .register(
        encodeFunctionSignature(takeOrderFunctionSig),
        assetBlacklist.options.address
      )
      .send(managerTxOpts);
    await policyManager.methods
      .register(
        encodeFunctionSignature(makeOrderFunctionSig),
        maxPositions.options.address
      )
      .send(managerTxOpts);
    await policyManager.methods
      .register(
        encodeFunctionSignature(takeOrderFunctionSig),
        maxPositions.options.address
      )
      .send(managerTxOpts);
    await policyManager.methods
      .register(
        encodeFunctionSignature(makeOrderFunctionSig),
        maxConcentration.options.address
      )
      .send(managerTxOpts);
    await policyManager.methods
      .register(
        encodeFunctionSignature(takeOrderFunctionSig),
        maxConcentration.options.address
      )
      .send(managerTxOpts);

    maxConcentrationVal = await maxConcentration.methods
      .maxConcentration()
      .call();
    maxPositionsVal = await maxPositions.methods
      .maxPositions()
      .call();
    priceToleranceVal = await priceTolerance.methods
      .tolerance()
      .call();
  });

  test('Confirm policies have been set', async () => {
    const { policyManager } = fund;

    const makeOrderPoliciesRes = await policyManager.methods
      .getPoliciesBySig(encodeFunctionSignature(makeOrderFunctionSig))
      .call();
    const makeOrderPolicyAddresses = [
      ...makeOrderPoliciesRes[0],
      ...makeOrderPoliciesRes[1]
    ];
    const takeOrderPoliciesRes = await policyManager.methods
      .getPoliciesBySig(encodeFunctionSignature(takeOrderFunctionSig))
      .call();
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
        (await priceSource.methods.getPrice(takerAsset).call())[0]
      );
      const takerQuantity = BNExpDiv(
        new BN(makerQuantity),
        wethToTakerAssetRate
      ).toString();

      await expect(
        trading.methods
          .callOnExchange(
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
          )
          .send(managerTxOpts)
      ).rejects.toThrow(ruleFailureString + 'AssetBlacklist');
    });
    test('Good make order: non-blacklisted taker asset', async () => {
      const { accounting, trading } = fund;

      const takerAsset = mln.options.address;
      const wethToTakerAssetRate = new BN(
        (await priceSource.methods.getPrice(takerAsset).call())[0]
      );
      const takerQuantity = BNExpDiv(
        new BN(makerQuantity),
        wethToTakerAssetRate
      ).toString();

      const receipt = await trading.methods
        .callOnExchange(
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
        )
        .send(managerTxOpts)

      expect(receipt).toBeTruthy();

      // Take order with EOA
      const logMake = getEventFromReceipt(
        receipt.events,
        CONTRACT_NAMES.OASIS_DEX_EXCHANGE,
        'LogMake'
      );
      const orderId = hexToNumber(logMake.id);
      await mln.methods
        .approve(oasisDex.options.address, takerQuantity)
        .send(investorTxOpts);
      await oasisDex.methods
        .buy(orderId, makerQuantity)
        .send(investorTxOpts);

      // Update accounting so maker asset is no longer marked as in an open order
      await accounting.methods.updateOwnedAssets().send(managerTxOpts);
      await trading.methods.returnAssetToVault(takerAsset).send(managerTxOpts);
      await trading.methods.updateAndGetQuantityBeingTraded(makerAsset).send(managerTxOpts);

      const isInOpenMakeOrder = await trading.methods.isInOpenMakeOrder(makerAsset).call();
      expect(isInOpenMakeOrder).toEqual(false);

      // Increment next block time past the maker asset cooldown period
      const cooldownTime = await trading.methods.MAKE_ORDER_COOLDOWN().call();
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

      const wethToTakerAssetRate = (await priceSource.methods
        .getPrice(takerAsset)
        .call())[0];

      expectedTakerQuantity = BNExpDiv(
        new BN(makerQuantity),
        new BN(wethToTakerAssetRate)
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
        trading.methods
          .callOnExchange(
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
          )
          .send(managerTxOpts)
      ).rejects.toThrow(ruleFailureString + 'PriceTolerance');
    });
    test('Good make order: slippage just within limit', async () => {
      const { accounting, trading } = fund;

      const toleratedTakerQuantity = BNExpMul(
        new BN(expectedTakerQuantity),
        takerQuantityPercentLimit.add(takerQuantityPercentShift)
      ).toString();

      const receipt = await trading.methods
        .callOnExchange(
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
        )
        .send(managerTxOpts);
      expect(receipt).toBeTruthy();

      // Take order with EOA
      const logMake = getEventFromReceipt(
        receipt.events,
        CONTRACT_NAMES.OASIS_DEX_EXCHANGE,
        'LogMake'
      );
      const orderId = hexToNumber(logMake.id);
      await mln.methods
        .approve(oasisDex.options.address, toleratedTakerQuantity)
        .send(investorTxOpts);
      await oasisDex.methods
        .buy(orderId, makerQuantity)
        .send(investorTxOpts);

      // Update accounting so maker asset is no longer marked as in an open order
      await accounting.methods.updateOwnedAssets().send(managerTxOpts);
      await trading.methods.returnAssetToVault(takerAsset).send(managerTxOpts);
      await trading.methods.updateAndGetQuantityBeingTraded(makerAsset).send(managerTxOpts);

      const isInOpenMakeOrder = await trading.methods.isInOpenMakeOrder(makerAsset).call();
      expect(isInOpenMakeOrder).toEqual(false);

      // Increment next block time past the maker asset cooldown period
      const cooldownTime = await trading.methods.MAKE_ORDER_COOLDOWN().call();
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
        (await priceSource.methods.getPrice(takerAsset).call())[0]
      );
    });

    test('Good make order: just under max-concentration', async () => {
      const { accounting, trading } = fund;

      const takerAssetGav = new BN(
        await accounting.methods.calcAssetGAV(takerAsset).call()
      );
      const fundGav = new BN(await accounting.methods.calcGav().call());
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

      const receipt = await trading.methods
        .callOnExchange(
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
        )
        .send(managerTxOpts)

      expect(receipt).toBeTruthy();

      // Take order with EOA
      const logMake = getEventFromReceipt(
        receipt.events,
        CONTRACT_NAMES.OASIS_DEX_EXCHANGE,
        'LogMake'
      );
      const orderId = hexToNumber(logMake.id);
      await dai.methods
        .approve(oasisDex.options.address, takerQuantity)
        .send(investorTxOpts);
      await oasisDex.methods
        .buy(orderId, makerQuantity)
        .send(investorTxOpts);

      // Update accounting so maker asset is no longer marked as in an open order
      await accounting.methods.updateOwnedAssets().send(managerTxOpts);
      await trading.methods.returnAssetToVault(takerAsset).send(managerTxOpts);
      await trading.methods.updateAndGetQuantityBeingTraded(makerAsset).send(managerTxOpts);

      const isInOpenMakeOrder = await trading.methods.isInOpenMakeOrder(makerAsset).call();
      expect(isInOpenMakeOrder).toEqual(false);

      // Increment next block time past the maker asset cooldown period
      const cooldownTime = await trading.methods.MAKE_ORDER_COOLDOWN().call();
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
        trading.methods
          .callOnExchange(
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
          )
          .send(managerTxOpts)
      ).rejects.toThrow(ruleFailureString + 'MaxConcentration');
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

    const exchangeInfo = await trading.methods.getExchangeInfo().call();
    oasisDexExchangeIndex = exchangeInfo[1].findIndex(
      e => e.toLowerCase() === oasisDexAdapter.options.address.toLowerCase(),
    );

    assetWhitelist = await deploy(
      CONTRACT_NAMES.ASSET_WHITELIST,
      [[dai.options.address, mln.options.address, zrx.options.address]]
    );
    const currentPositions = await accounting.methods.getOwnedAssetsLength().call();
    const maxPositionsArg = Number(currentPositions) + 2;
    maxPositions = await deploy(
      CONTRACT_NAMES.MAX_POSITIONS,
      [maxPositionsArg]
    );

    await policyManager.methods
      .register(
        encodeFunctionSignature(makeOrderFunctionSig),
        assetWhitelist.options.address
      )
      .send(managerTxOpts);
    await policyManager.methods
      .register(
        encodeFunctionSignature(takeOrderFunctionSig),
        assetWhitelist.options.address
      )
      .send(managerTxOpts);
    await policyManager.methods
      .register(
        encodeFunctionSignature(makeOrderFunctionSig),
        maxPositions.options.address
      )
      .send(managerTxOpts);
    await policyManager.methods
      .register(
        encodeFunctionSignature(takeOrderFunctionSig),
        maxPositions.options.address
      )
      .send(managerTxOpts);
  });

  test('Confirm policies have been set', async () => {
    const { policyManager } = fund;

    const makeOrderPoliciesRes = await policyManager.methods
      .getPoliciesBySig(encodeFunctionSignature(makeOrderFunctionSig))
      .call();
    const makeOrderPolicyAddresses = [
      ...makeOrderPoliciesRes[0],
      ...makeOrderPoliciesRes[1]
    ];
    const takeOrderPoliciesRes = await policyManager.methods
      .getPoliciesBySig(encodeFunctionSignature(takeOrderFunctionSig))
      .call();
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

      const wethToTakerAssetRate = (await priceSource.methods
        .getPrice(takerAsset)
        .call())[0];
      const takerQuantity = BNExpDiv(
        new BN(makerQuantity),
        new BN(wethToTakerAssetRate)
      ).toString();

      await expect(
        trading.methods
          .callOnExchange(
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
          )
          .send(managerTxOpts)
      ).rejects.toThrow(ruleFailureString + 'AssetWhitelist');
    });

    test('Good make order: whitelisted taker asset', async () => {
      const { accounting, trading } = fund;

      const takerAsset = zrx.options.address;

      const wethToTakerAssetRate = (await priceSource.methods
        .getPrice(takerAsset)
        .call())[0];
      const takerQuantity = BNExpDiv(
        new BN(makerQuantity),
        new BN(wethToTakerAssetRate)
      ).toString();

      const receipt = await trading.methods
        .callOnExchange(
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
        )
        .send(managerTxOpts);

      const logMake = getEventFromReceipt(
        receipt.events,
        CONTRACT_NAMES.OASIS_DEX_EXCHANGE,
        'LogMake'
      );
      const orderId = hexToNumber(logMake.id);
      await zrx.methods
        .approve(oasisDex.options.address, takerQuantity)
        .send(investorTxOpts);
      await oasisDex.methods
        .buy(orderId, makerQuantity)
        .send(investorTxOpts);

      // Update accounting so maker asset is no longer marked as in an open order
      await accounting.methods.updateOwnedAssets().send(managerTxOpts);
      await trading.methods.returnAssetToVault(takerAsset).send(managerTxOpts);
      await trading.methods.updateAndGetQuantityBeingTraded(makerAsset).send(managerTxOpts);

      const isInOpenMakeOrder = await trading.methods.isInOpenMakeOrder(makerAsset).call();
      expect(isInOpenMakeOrder).toEqual(false);

      // Increment next block time past the maker asset cooldown period
      const cooldownTime = await trading.methods.MAKE_ORDER_COOLDOWN().call();
      await increaseTime(cooldownTime*2);
      await mine();
    });
  });

  describe('Max positions', () => {
    test('Good take order: final allowed position', async () => {
      const { accounting, trading } = fund;

      const maxPositionsVal = await maxPositions.methods.maxPositions().call();

      const preOwnedAssetsLength = await accounting.methods.getOwnedAssetsLength().call();
      expect(Number(preOwnedAssetsLength)).toEqual(Number(maxPositionsVal) - 1);

      const takerAsset = weth.options.address;
      const takerQuantity = toWei('0.01', 'ether');
      const makerAsset = mln.options.address;
      const wethToMakerAssetRate = (await priceSource.methods
        .getPrice(makerAsset)
        .call())[0];
      const makerQuantity = BNExpDiv(
        new BN(takerQuantity),
        new BN(wethToMakerAssetRate)
      ).toString();

      await mln.methods
        .approve(oasisDex.options.address, makerQuantity)
        .send(investorTxOpts);
      const res = await oasisDex.methods
        .offer(makerQuantity, makerAsset, takerQuantity, takerAsset, 0)
        .send(investorTxOpts);
      const orderId = res.events.LogMake.returnValues.id;

      await trading.methods
        .callOnExchange(
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
          orderId,
          '0x0',
        )
        .send(managerTxOpts)

      const postOwnedAssetsLength = await accounting.methods.getOwnedAssetsLength().call();
      expect(postOwnedAssetsLength).toEqual(maxPositionsVal);
    });

    test('Bad make order: over limit for positions', async () => {
      const { trading } = fund;

      const makerAsset = weth.options.address;
      const makerQuantity = toWei('0.01', 'ether');
      const takerAsset = dai.options.address;
      const wethToTakerAssetRate = (await priceSource.methods
        .getPrice(takerAsset)
        .call())[0];
      const takerQuantity = BNExpDiv(
        new BN(makerQuantity),
        new BN(wethToTakerAssetRate)
      ).toString();

      await expect(
        trading.methods
          .callOnExchange(
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
          )
          .send(managerTxOpts)
      ).rejects.toThrow(ruleFailureString + 'MaxPositions');
    });

    test('Good make order: add to current position', async () => {
      const { trading } = fund;

      const makerAsset = weth.options.address;
      const makerQuantity = toWei('0.01', 'ether');
      const takerAsset = zrx.options.address;
      const wethToTakerAssetRate = (await priceSource.methods
        .getPrice(takerAsset)
        .call())[0];
      const takerQuantity = BNExpDiv(
        new BN(makerQuantity),
        new BN(wethToTakerAssetRate)
      ).toString();

      const receipt = await trading.methods
        .callOnExchange(
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
        )
        .send(managerTxOpts)

      expect(receipt).toBeTruthy();
    });
  });
});
