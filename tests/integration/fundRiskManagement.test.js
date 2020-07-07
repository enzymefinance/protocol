/*
 * @file Tests a fund's risk management policies in executing trades
 *
 * @test Fund policies are set
 * @test A fund can only take an order for a non-blacklisted asset
 * @test A fund can only take an order with a tolerable amount of price slippage
 * @test A fund cannot take an order with an asset if it will exceed its max concentration
 * @test A fund can only take an order for a whitelisted asset
 * @test A fund can only take an order for its current assets once max positions is reached
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { BNExpMul, BNExpDiv } from '~/utils/BNmath';
import { CALL_ON_INTEGRATION_ENCODING_TYPES, CONTRACT_NAMES } from '~/utils/constants';
import { encodeArgs } from '~/utils/formatting';
import { setupFundWithParams } from '~/utils/fund';
import { getFunctionSignature } from '~/utils/metadata';
import { encodeArgs } from '~/utils/formatting';
import { getDeployed } from '~/utils/getDeployed';
import {
  createUnsignedZeroExOrder,
  encodeZeroExTakeOrderArgs,
  isValidZeroExSignatureOffChain,
  signZeroExOrder
} from '~/utils/zeroExV2';
import mainnetAddrs from '~/config';

let deployer, manager;
let defaultTxOpts, managerTxOpts;
let takeOrderFunctionSig;
let fundFactory, priceSource;
let kyberAdapter, zeroExAdapter;
let assetBlacklist, assetWhitelist, maxConcentration, maxPositions, priceTolerance;
let kyberNetworkProxy, zeroExExchange, erc20ProxyAddress;
let rep, knc, mln, weth, zrx;

beforeAll(async () => {
  [deployer, manager] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { ...defaultTxOpts, from: manager };

  rep = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.REP);
  knc = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.KNC);
  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);
  zrx = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.ZRX);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);
  kyberAdapter = getDeployed(CONTRACT_NAMES.KYBER_ADAPTER);
  kyberNetworkProxy = getDeployed(CONTRACT_NAMES.KYBER_NETWORK_PROXY, mainnetAddrs.kyber.KyberNetworkProxy);
  assetBlacklist = getDeployed(CONTRACT_NAMES.ASSET_BLACKLIST);
  assetWhitelist = getDeployed(CONTRACT_NAMES.ASSET_WHITELIST);
  maxPositions = getDeployed(CONTRACT_NAMES.MAX_POSITIONS);
  maxConcentration = getDeployed(CONTRACT_NAMES.MAX_CONCENTRATION);
  priceTolerance = getDeployed(CONTRACT_NAMES.PRICE_TOLERANCE);
  zeroExAdapter = getDeployed(CONTRACT_NAMES.ZERO_EX_V2_ADAPTER);
  zeroExExchange = getDeployed(CONTRACT_NAMES.ZERO_EX_V2_EXCHANGE_INTERFACE, mainnetAddrs.zeroExV2.ZeroExV2Exchange);

  erc20ProxyAddress = mainnetAddrs.zeroExV2.ZeroExV2ERC20Proxy;

  takeOrderFunctionSig = getFunctionSignature(
    CONTRACT_NAMES.KYBER_ADAPTER,
    'takeOrder',
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
      integrationAdapters: [kyberAdapter.options.address, zeroExAdapter.options.address],
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

    const policies = await call(policyManager, 'getEnabledPolicies');
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
    let outgoingAsset, outgoingAssetAmount;
    let badIncomingAsset, goodIncomingAsset;

    beforeAll(async () => {
      outgoingAsset = weth.options.address;
      outgoingAssetAmount = toWei('0.01', 'ether');
      badIncomingAsset = knc.options.address;
      goodIncomingAsset = mln.options.address;
    });

    test('Bad take order: blacklisted incoming asset', async () => {
      const { vault } = fund;

      const encodedArgs = encodeArgs(
        CALL_ON_INTEGRATION_ENCODING_TYPES.KYBER.TAKE_ORDER,
        [
          badIncomingAsset, // incoming asset
          1, // min incoming asset amount
          outgoingAsset, // outgoing asset,
          outgoingAssetAmount // exact outgoing asset amount
        ]
      );

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            kyberAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts
        )
      ).rejects.toThrowFlexible('Rule evaluated to false: ASSET_BLACKLIST');
    });

    test('Good take order: non-blacklisted incoming asset', async () => {
      const { vault } = fund;

      const encodedArgs = encodeArgs(
        CALL_ON_INTEGRATION_ENCODING_TYPES.KYBER.TAKE_ORDER,
        [
          goodIncomingAsset, // incoming asset
          1, // min incoming asset amount
          outgoingAsset, // outgoing asset,
          outgoingAssetAmount // exact outgoing asset amount
        ]
      );

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            kyberAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts
        )
      ).resolves.not.toThrow();
    });
  });

  describe('Price tolerance', () => {
    let incomingAsset, outgoingAsset, outgoingAssetAmount;
    let expectedIncomingAssetAmount, badIncomingAssetAmount, goodIncomingAssetAmount;
    let incomingAssetAmountPercentLimit, incomingAssetAmountPercentShift;
    let badSignedOrder, goodSignedOrder;

    beforeAll(async () => {
      incomingAsset = mln.options.address;
      outgoingAsset = weth.options.address;
      outgoingAssetAmount = toWei('0.01', 'ether');

      const incomingToOutgoingAssetRate = new BN(
        (await call(priceSource, 'getLiveRate', [incomingAsset, outgoingAsset]))[0]
      );
      expectedIncomingAssetAmount = BNExpDiv(
        new BN(outgoingAssetAmount),
        incomingToOutgoingAssetRate
      ).toString();

      incomingAssetAmountPercentLimit =
        new BN(toWei('1', 'ether')).sub(new BN(priceToleranceVal));
      incomingAssetAmountPercentShift = new BN(toWei('0.01', 'ether')); // 1%
    });

    test('Third party makes an order', async () => {
      badIncomingAssetAmount = BNExpMul(
        new BN(expectedIncomingAssetAmount),
        incomingAssetAmountPercentLimit.sub(incomingAssetAmountPercentShift)
      ).toString();

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        {
          makerAddress: deployer,
          makerTokenAddress: incomingAsset,
          makerAssetAmount: badIncomingAssetAmount,
          takerTokenAddress: outgoingAsset,
          takerAssetAmount: outgoingAssetAmount
        }
      );
  
      await send(mln, 'approve', [erc20ProxyAddress, badIncomingAssetAmount], defaultTxOpts);
  
      badSignedOrder = await signZeroExOrder(unsignedOrder, deployer);
  
      const signatureValid = await isValidZeroExSignatureOffChain(
        unsignedOrder,
        badSignedOrder.signature,
        deployer
      );
  
      expect(signatureValid).toBeTruthy();
    });

    test('Bad take order: slippage just above limit', async () => {
      const { vault } = fund;

      const encodedArgs = encodeZeroExTakeOrderArgs(badSignedOrder, outgoingAssetAmount);

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            zeroExAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts
        )
      ).rejects.toThrowFlexible('Rule evaluated to false: PRICE_TOLERANCE');
    });

    test('Third party makes an order', async () => {
      goodIncomingAssetAmount = BNExpMul(
        new BN(expectedIncomingAssetAmount),
        incomingAssetAmountPercentLimit.add(incomingAssetAmountPercentShift)
      ).toString();

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        {
          makerAddress: deployer,
          makerTokenAddress: incomingAsset,
          makerAssetAmount: goodIncomingAssetAmount,
          takerTokenAddress: outgoingAsset,
          takerAssetAmount: outgoingAssetAmount
        }
      );
  
      await send(mln, 'approve', [erc20ProxyAddress, goodIncomingAssetAmount], defaultTxOpts);
  
      goodSignedOrder = await signZeroExOrder(unsignedOrder, deployer);
  
      const signatureValid = await isValidZeroExSignatureOffChain(
        unsignedOrder,
        goodSignedOrder.signature,
        deployer
      );
  
      expect(signatureValid).toBeTruthy();
    });

    test('Good take order: slippage just within limit', async () => {
      const { vault } = fund;

      const encodedArgs = encodeZeroExTakeOrderArgs(goodSignedOrder, outgoingAssetAmount);

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            zeroExAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts
        )
      ).resolves.not.toThrow();
    });
  });

  // @dev need to assure that order prices are consistent with asset gav calculations
  describe('Max concentration', () => {
    let incomingAsset, outgoingAsset;
    let toleratedIncomingAssetAmount, toleratedOutgoingAssetAmount;
    let highIncomingAssetAmount, highOutgoingAssetAmount;
    let signedOrder;

    beforeAll(async () => {
      const { shares, vault } = fund;
      incomingAsset = rep.options.address;
      outgoingAsset = weth.options.address;
      const incomingToOutgoingAssetLiveRate = new BN(
        (await call(priceSource, 'getLiveRate', [incomingAsset, outgoingAsset]))[0]
      );

      const incomingAssetGav = BNExpMul(
        new BN(await call(rep, 'balanceOf', [vault.options.address])),
        incomingToOutgoingAssetLiveRate
      );

      const fundGav = new BN(await call(shares, 'calcGav'));
      const incomingAssetGavPercent = BNExpDiv(incomingAssetGav, fundGav);
      const allowedIncomingAssetGavPercentage =
        new BN(maxConcentrationVal).sub(incomingAssetGavPercent);

      const percentageShift = new BN(toWei('0.01', 'ether')); // 1%

      toleratedIncomingAssetAmount = BNExpMul(
        fundGav,
        allowedIncomingAssetGavPercentage.sub(percentageShift)
      ).toString();

      toleratedOutgoingAssetAmount = BNExpMul(
        new BN(toleratedIncomingAssetAmount),
        incomingToOutgoingAssetLiveRate
      ).toString();

      highIncomingAssetAmount = BNExpMul(
        fundGav,
        allowedIncomingAssetGavPercentage.add(percentageShift)
      ).toString();

      highOutgoingAssetAmount = BNExpMul(
        new BN(highIncomingAssetAmount),
        incomingToOutgoingAssetLiveRate
      ).toString();
    });

    test('Third party makes an order with more than tolerated incoming asset amount', async () => {
      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        {
          makerAddress: deployer,
          makerTokenAddress: incomingAsset,
          makerAssetAmount: highIncomingAssetAmount,
          takerTokenAddress: outgoingAsset,
          takerAssetAmount: highOutgoingAssetAmount
        }
      );
  
      await send(rep, 'approve', [erc20ProxyAddress, highIncomingAssetAmount], defaultTxOpts);
  
      signedOrder = await signZeroExOrder(unsignedOrder, deployer);
  
      const signatureValid = await isValidZeroExSignatureOffChain(
        unsignedOrder,
        signedOrder.signature,
        deployer
      );
  
      expect(signatureValid).toBeTruthy();
    });

    test('Bad take order: max concentration exceeded', async () => {
      const { vault } = fund;

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, highOutgoingAssetAmount);

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            zeroExAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts
        )
      ).rejects.toThrowFlexible('Rule evaluated to false: MAX_CONCENTRATION');
    });

    test('Good take order: just under max-concentration', async () => {
      const { vault } = fund;

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, toleratedOutgoingAssetAmount);

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            zeroExAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts
        )
      ).resolves.not.toThrow();
    });
  });
});

/*
 * Fund #2: Trading on Oasis Dex
 * Asset whitelist: REP, MLN, ZRX
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
          [[rep.options.address, mln.options.address, zrx.options.address]]
        ),
        encodeArgs(['uint256'], [3])
      ]
    };
    fund = await setupFundWithParams({
      defaultTokens: [weth.options.address],
      integrationAdapters: [kyberAdapter.options.address],
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

    const policies = await call(policyManager, 'getEnabledPolicies');
    const expectedPolicies = [
      maxPositions.options.address,
      assetWhitelist.options.address
    ];

    for (const policy of expectedPolicies) {
      expect(policies).toContain(policy);
    }
  });

  describe('Asset whitelist', () => {
    let outgoingAsset, outgoingAssetAmount;
    let badIncomingAsset, goodIncomingAsset;

    beforeAll(async () => {
      outgoingAsset = weth.options.address;
      outgoingAssetAmount = toWei('0.01', 'ether');
      badIncomingAsset = knc.options.address;
      goodIncomingAsset = zrx.options.address;
    });

    test('Bad take order: non-whitelisted maker asset', async () => {
      const { vault } = fund;

      const encodedArgs = encodeArgs(
        CALL_ON_INTEGRATION_ENCODING_TYPES.KYBER.TAKE_ORDER,
        [
          badIncomingAsset, // incoming asset
          1, // min incoming asset amount
          outgoingAsset, // outgoing asset,
          outgoingAssetAmount // exact outgoing asset amount
        ]
      );

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            kyberAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts
        )
      ).rejects.toThrowFlexible('Rule evaluated to false: ASSET_WHITELIST');
    });

    test('Good take order: whitelisted incoming asset', async () => {
      const { vault } = fund;

      const encodedArgs = encodeArgs(
        CALL_ON_INTEGRATION_ENCODING_TYPES.KYBER.TAKE_ORDER,
        [
          goodIncomingAsset, // incoming asset
          1, // min incoming asset amount
          outgoingAsset, // outgoing asset,
          outgoingAssetAmount // exact outgoing asset amount
        ]
      );

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            kyberAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts
        )
      ).resolves.not.toThrow();
    });
  });

  describe('Max positions', () => {
    let outgoingAsset, outgoingAssetAmount;
    let badIncomingAsset, goodIncomingAsset;

    beforeAll(async () => {
      outgoingAsset = weth.options.address;
      outgoingAssetAmount = toWei('0.01', 'ether');

      badIncomingAsset = rep.options.address;
      goodIncomingAsset = mln.options.address;
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

      const encodedArgs = encodeArgs(
        CALL_ON_INTEGRATION_ENCODING_TYPES.KYBER.TAKE_ORDER,
        [
          goodIncomingAsset, // incoming asset
          1, // min incoming asset amount
          outgoingAsset, // outgoing asset,
          outgoingAssetAmount // exact outgoing asset amount
        ]
      );

      await send(
        vault,
        'callOnIntegration',
        [
          kyberAdapter.options.address,
          takeOrderFunctionSig,
          encodedArgs,
        ],
        managerTxOpts
      );

      const postOwnedAssetsLength = (await call(vault, 'getOwnedAssets')).length;
      expect(postOwnedAssetsLength).toEqual(Number(maxPositionsVal));
    });

    test('Bad take order: over limit for positions', async () => {
      const { vault } = fund;

      const encodedArgs = encodeArgs(
        CALL_ON_INTEGRATION_ENCODING_TYPES.KYBER.TAKE_ORDER,
        [
          badIncomingAsset, // incoming asset
          1, // min incoming asset amount
          outgoingAsset, // outgoing asset,
          outgoingAssetAmount // exact outgoing asset amount
        ]
      );

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            kyberAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts
        )
      ).rejects.toThrowFlexible('Rule evaluated to false: MAX_POSITIONS');
    });

    test('Good make order 2: add to current position', async () => {
      const { vault } = fund;

      const encodedArgs = encodeArgs(
        CALL_ON_INTEGRATION_ENCODING_TYPES.KYBER.TAKE_ORDER,
        [
          goodIncomingAsset, // incoming asset
          1, // min incoming asset amount
          outgoingAsset, // outgoing asset,
          outgoingAssetAmount // exact outgoing asset amount
        ]
      );

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            kyberAdapter.options.address,
            takeOrderFunctionSig,
            encodedArgs,
          ],
          managerTxOpts
        )
      ).resolves.not.toThrowFlexible();
    });
  });
});
