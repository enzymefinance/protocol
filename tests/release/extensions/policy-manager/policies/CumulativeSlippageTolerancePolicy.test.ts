import { randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  ComptrollerLib,
  IntegrationManager,
  MockGenericAdapter,
  MockGenericIntegratee,
  ONE_DAY_IN_SECONDS,
  ONE_HUNDRED_PERCENT_IN_WEI,
  ONE_ONE_HUNDREDTH_PERCENT_IN_WEI,
  PolicyHook,
  policyManagerConfigArgs,
  CumulativeSlippageTolerancePolicy,
  cumulativeSlippageTolerancePolicyArgs,
  StandardToken,
  TEN_PERCENT_IN_WEI,
  VaultLib,
  ValueInterpreter,
  FIVE_PERCENT_IN_WEI,
} from '@enzymefinance/protocol';
import {
  addNewAssetsToFund,
  assertEvent,
  buyShares,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  mockGenericSwap,
  ProtocolDeployment,
  transactionTimestamp,
  vaultCallStartAssetBypassTimelock,
} from '@enzymefinance/testutils';
import { BigNumber } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const cumulativeSlippageTolerancePolicy = fork.deployment.cumulativeSlippageTolerancePolicy;

    expect(await cumulativeSlippageTolerancePolicy.getAddressListRegistry()).toMatchAddress(
      fork.deployment.addressListRegistry,
    );
    // TODO: make this exact when we update config to include the ids of addresses
    expect(await cumulativeSlippageTolerancePolicy.getBypassableAdaptersListId()).toBeGtBigNumber(0);
    expect(await cumulativeSlippageTolerancePolicy.getTolerancePeriodDuration()).toEqBigNumber(ONE_DAY_IN_SECONDS * 7);

    // PricelessAssetBypassMixin
    expect(await cumulativeSlippageTolerancePolicy.getPricelessAssetBypassTimeLimit()).toEqBigNumber(
      ONE_DAY_IN_SECONDS * 2,
    );
    expect(await cumulativeSlippageTolerancePolicy.getPricelessAssetBypassTimelock()).toEqBigNumber(
      ONE_DAY_IN_SECONDS * 7,
    );
    expect(await cumulativeSlippageTolerancePolicy.getPricelessAssetBypassValueInterpreter()).toMatchAddress(
      fork.deployment.valueInterpreter,
    );
    expect(await cumulativeSlippageTolerancePolicy.getPricelessAssetBypassWethToken()).toMatchAddress(fork.config.weth);

    // PolicyBase
    expect(await cumulativeSlippageTolerancePolicy.getPolicyManager()).toMatchAddress(fork.deployment.policyManager);
  });
});

describe('addFundSettings', () => {
  let fundOwner: SignerWithAddress;
  let cumulativeSlippageTolerancePolicy: CumulativeSlippageTolerancePolicy;

  beforeEach(async () => {
    [fundOwner] = fork.accounts;
    cumulativeSlippageTolerancePolicy = fork.deployment.cumulativeSlippageTolerancePolicy;
  });

  it('cannot be called by a random user', async () => {
    await expect(cumulativeSlippageTolerancePolicy.addFundSettings(randomAddress(), '0x')).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('does not allow a tolerance >= max value', async () => {
    await expect(
      createNewFund({
        signer: fundOwner,
        fundDeployer: fork.deployment.fundDeployer,
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
        fundOwner,
        policyManagerConfig: policyManagerConfigArgs({
          policies: [cumulativeSlippageTolerancePolicy],
          settings: [
            cumulativeSlippageTolerancePolicyArgs({
              tolerance: ONE_HUNDRED_PERCENT_IN_WEI,
            }),
          ],
        }),
      }),
    ).rejects.toBeRevertedWith('Max tolerance exceeded');
  });

  it('happy path', async () => {
    const tolerance = 9999;
    const { comptrollerProxy, receipt } = await createNewFund({
      signer: fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [cumulativeSlippageTolerancePolicy],
        settings: [
          cumulativeSlippageTolerancePolicyArgs({
            tolerance,
          }),
        ],
      }),
    });

    // Assert state
    expect(await cumulativeSlippageTolerancePolicy.getPolicyInfoForFund(comptrollerProxy)).toMatchFunctionOutput(
      cumulativeSlippageTolerancePolicy.getPolicyInfoForFund,
      {
        tolerance,
        cumulativeSlippage: BigNumber.from(0),
        lastSlippageTimestamp: BigNumber.from(0),
      },
    );

    // Assert event
    assertEvent(receipt, cumulativeSlippageTolerancePolicy.abi.getEvent('FundSettingsSet'), {
      comptrollerProxy,
      tolerance,
    });
  });
});

describe('canDisable', () => {
  it('returns false', async () => {
    expect(await fork.deployment.cumulativeSlippageTolerancePolicy.canDisable()).toBe(false);
  });
});

describe('implementsHooks', () => {
  it('returns only the correct hook', async () => {
    const cumulativeSlippageTolerancePolicy = fork.deployment.cumulativeSlippageTolerancePolicy;

    expect(await cumulativeSlippageTolerancePolicy.implementedHooks()).toMatchFunctionOutput(
      cumulativeSlippageTolerancePolicy.implementedHooks.fragment,
      [PolicyHook.PostCallOnIntegration],
    );
  });
});

describe('updateFundSettings', () => {
  it('does not allow updates', async () => {
    await expect(
      fork.deployment.cumulativeSlippageTolerancePolicy.updateFundSettings(randomAddress(), '0x'),
    ).rejects.toBeRevertedWith('Updates not allowed for this policy');
  });
});

describe('validateRule', () => {
  const tolerance = TEN_PERCENT_IN_WEI;
  let fundOwner: SignerWithAddress;
  let mockGenericAdapter: MockGenericAdapter, mockGenericIntegratee: MockGenericIntegratee;
  let integrationManager: IntegrationManager, valueInterpreter: ValueInterpreter;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let cumulativeSlippageTolerancePolicy: CumulativeSlippageTolerancePolicy;
  let denominationAsset: StandardToken;

  beforeEach(async () => {
    [fundOwner] = fork.accounts;
    cumulativeSlippageTolerancePolicy = fork.deployment.cumulativeSlippageTolerancePolicy;
    integrationManager = fork.deployment.integrationManager;
    valueInterpreter = fork.deployment.valueInterpreter;

    mockGenericIntegratee = await MockGenericIntegratee.deploy(fork.deployer);
    mockGenericAdapter = await MockGenericAdapter.deploy(fork.deployer, mockGenericIntegratee);

    denominationAsset = new StandardToken(fork.config.primitives.usdc, whales.usdc);

    const newFundRes = await createNewFund({
      signer: fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [cumulativeSlippageTolerancePolicy],
        settings: [
          cumulativeSlippageTolerancePolicyArgs({
            tolerance,
          }),
        ],
      }),
    });
    comptrollerProxy = newFundRes.comptrollerProxy;
    vaultProxy = newFundRes.vaultProxy;
  });

  it('cannot be called by a random user', async () => {
    await expect(cumulativeSlippageTolerancePolicy.validateRule(comptrollerProxy, 0, '0x')).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('happy path: simple, USD stables only, using human-readable numbers and calcs', async () => {
    const outgoingAsset = denominationAsset;
    const incomingAsset = new StandardToken(fork.config.primitives.dai, whales.dai);

    const outgoingAssetUnit = await getAssetUnit(outgoingAsset);

    // Use same outgoingAssetAmount throughout
    const outgoingAssetAmount = outgoingAssetUnit.mul(100);
    // Rounds amount down, so should be slightly less or equal to the outgoingAssetAmount
    const zeroSlippageIncomingAssetAmount = await valueInterpreter.calcCanonicalAssetValue
      .args(outgoingAsset, outgoingAssetAmount, incomingAsset)
      .call();

    // Seed mock generic integratee with incoming assets
    await incomingAsset.transfer(mockGenericIntegratee, zeroSlippageIncomingAssetAmount.mul(10));

    // Buy shares to seed fund with denomination asset
    await buyShares({
      comptrollerProxy,
      denominationAsset,
      buyer: fundOwner,
      investmentAmount: outgoingAssetAmount.mul(10),
      seedBuyer: true,
    });

    // Reaffirm expected 10% tolerance
    expect((await cumulativeSlippageTolerancePolicy.getPolicyInfoForFund(comptrollerProxy)).tolerance).toEqBigNumber(
      TEN_PERCENT_IN_WEI,
    );

    // FIRST SWAP - Exact tolerance limit
    const firstSwapIncomingAssetAmount = zeroSlippageIncomingAssetAmount.mul(9).div(10).add(2); // exactly 10% slippage, after rounding up
    const firstSwapReceipt = await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      incomingAssets: [incomingAsset],
      actualIncomingAssetAmounts: [firstSwapIncomingAssetAmount],
      spendAssets: [outgoingAsset],
      actualSpendAssetAmounts: [outgoingAssetAmount],
    });

    // Assert state
    const postFirstSwapPolicyInfo = await cumulativeSlippageTolerancePolicy.getPolicyInfoForFund(comptrollerProxy);
    expect(postFirstSwapPolicyInfo.cumulativeSlippage).toEqBigNumber(TEN_PERCENT_IN_WEI);
    expect(postFirstSwapPolicyInfo.lastSlippageTimestamp).toEqBigNumber(await transactionTimestamp(firstSwapReceipt));

    // Assert event
    assertEvent(firstSwapReceipt, cumulativeSlippageTolerancePolicy.abi.getEvent('CumulativeSlippageUpdatedForFund'), {
      comptrollerProxy,
      nextCumulativeSlippage: postFirstSwapPolicyInfo.cumulativeSlippage,
    });

    // SECOND SWAP - 0.01% slippage trade
    const secondSwapIncomingAssetAmount = zeroSlippageIncomingAssetAmount.mul(9999).div(10000).add(2); // 0.01% slippage

    // Executing immediately should fail
    await expect(
      mockGenericSwap({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        mockGenericAdapter,
        incomingAssets: [incomingAsset],
        actualIncomingAssetAmounts: [secondSwapIncomingAssetAmount],
        spendAssets: [outgoingAsset],
        actualSpendAssetAmounts: [outgoingAssetAmount],
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: CUMULATIVE_SLIPPAGE_TOLERANCE');

    // Wait for half of the tolerance period duration to forgive half of tolerance limit
    await provider.send('evm_increaseTime', [
      BigNumber.from(await cumulativeSlippageTolerancePolicy.getTolerancePeriodDuration())
        .div(2)
        .toNumber(),
    ]);

    const secondSwapReceipt = await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      incomingAssets: [incomingAsset],
      actualIncomingAssetAmounts: [secondSwapIncomingAssetAmount],
      spendAssets: [outgoingAsset],
      actualSpendAssetAmounts: [outgoingAssetAmount],
    });

    // The cumulative loss should be roughly 50% of the original loss (i.e., 5%) plus roughly the new loss (i.e., 0.01%)
    const postSecondSwapPolicyInfo = await cumulativeSlippageTolerancePolicy.getPolicyInfoForFund(comptrollerProxy);
    expect(postSecondSwapPolicyInfo.cumulativeSlippage).toBeAroundBigNumber(
      FIVE_PERCENT_IN_WEI.add(ONE_ONE_HUNDREDTH_PERCENT_IN_WEI),
      ONE_ONE_HUNDREDTH_PERCENT_IN_WEI.div(100),
    );
    expect(postSecondSwapPolicyInfo.lastSlippageTimestamp).toEqBigNumber(await transactionTimestamp(secondSwapReceipt));

    // Assert event
    assertEvent(secondSwapReceipt, cumulativeSlippageTolerancePolicy.abi.getEvent('CumulativeSlippageUpdatedForFund'), {
      comptrollerProxy,
      nextCumulativeSlippage: postSecondSwapPolicyInfo.cumulativeSlippage,
    });
  });

  it('happy path: complex, multiple incoming and outgoing assets', async () => {
    const secondSpendAsset = new StandardToken(fork.config.weth, whales.weth);
    const secondSpendAssetUnit = await getAssetUnit(secondSpendAsset);
    const outgoingAssets = [denominationAsset, secondSpendAsset];
    const outgoingAssetUnits = [await getAssetUnit(denominationAsset), secondSpendAssetUnit];
    const incomingAssets = [
      new StandardToken(fork.config.primitives.usdt, whales.usdt),
      new StandardToken(fork.config.primitives.dai, whales.dai),
    ];

    // Use same outgoingAssetAmounts throughout
    const outgoingAssetAmounts = outgoingAssetUnits.map((asset) => asset.mul(3));

    // Add outgoing assets to fund
    await addNewAssetsToFund({
      signer: fundOwner,
      comptrollerProxy,
      integrationManager,
      assets: outgoingAssets,
      amounts: outgoingAssetAmounts.map((amount) => amount.mul(10)),
    });

    // Rounds amounts up, so should be slightly greater or equal to the outgoingAssetAmount
    const zeroSlippageIncomingAssetsDenominationAssetAmount = (
      await valueInterpreter.calcCanonicalAssetsTotalValue
        .args(outgoingAssets, outgoingAssetAmounts, denominationAsset)
        .call()
    ).add(2);
    const zeroSlippageIncomingAssetAmounts = await Promise.all(
      incomingAssets.map(async (asset) =>
        (
          await valueInterpreter.calcCanonicalAssetValue
            .args(denominationAsset, zeroSlippageIncomingAssetsDenominationAssetAmount.div(2), asset)
            .call()
        ).add(2),
      ),
    );

    // Seed mock generic integratee with incoming assets
    for (const i in incomingAssets) {
      await incomingAssets[i].transfer(mockGenericIntegratee, zeroSlippageIncomingAssetAmounts[i].mul(10));
    }

    // FIRST SWAP - Approx tolerance limit (each rounded up)
    const firstSwapIncomingAssetAmounts = zeroSlippageIncomingAssetAmounts.map((amount) =>
      amount.mul(BigNumber.from(ONE_HUNDRED_PERCENT_IN_WEI).sub(tolerance)).div(ONE_HUNDRED_PERCENT_IN_WEI).add(2),
    );
    const firstSwapReceipt = await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets: outgoingAssets,
      actualSpendAssetAmounts: outgoingAssetAmounts,
      incomingAssets,
      actualIncomingAssetAmounts: firstSwapIncomingAssetAmounts,
    });
    const firstSwapTimestamp = await transactionTimestamp(firstSwapReceipt);

    // Assert state
    const postFirstSwapPolicyInfo = await cumulativeSlippageTolerancePolicy.getPolicyInfoForFund(comptrollerProxy);
    expect(postFirstSwapPolicyInfo.lastSlippageTimestamp).toEqBigNumber(firstSwapTimestamp);
    expect(postFirstSwapPolicyInfo.cumulativeSlippage).toBeAroundBigNumber(
      tolerance,
      ONE_ONE_HUNDREDTH_PERCENT_IN_WEI.div(100),
    );

    // Assert events
    assertEvent(firstSwapReceipt, cumulativeSlippageTolerancePolicy.abi.getEvent('CumulativeSlippageUpdatedForFund'), {
      comptrollerProxy,
      nextCumulativeSlippage: postFirstSwapPolicyInfo.cumulativeSlippage,
    });

    // SECOND SWAP - insignificant amount, still under tolerance

    // An immediate second swap with negligible slippage should still go through and not update the cumulative slippage
    // 1 / (10 * ONE_HUNDRED_PERCENT_IN_WEI) to an insignificant amount
    const insignificantPrecision = ONE_HUNDRED_PERCENT_IN_WEI.mul(10);
    const secondSwapIncomingAssetAmounts = zeroSlippageIncomingAssetAmounts.map((amount) =>
      amount.mul(insignificantPrecision.sub(2)).div(insignificantPrecision),
    );
    await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets: outgoingAssets,
      actualSpendAssetAmounts: outgoingAssetAmounts,
      incomingAssets,
      actualIncomingAssetAmounts: secondSwapIncomingAssetAmounts,
    });

    // State vars should not be updated
    const postSecondSwapPolicyInfo = await cumulativeSlippageTolerancePolicy.getPolicyInfoForFund(comptrollerProxy);
    expect(postSecondSwapPolicyInfo.lastSlippageTimestamp).toEqBigNumber(firstSwapTimestamp);
    expect(postSecondSwapPolicyInfo.cumulativeSlippage).toEqBigNumber(postFirstSwapPolicyInfo.cumulativeSlippage);

    // THIRD SWAP - FAILURE - 0.01% above cumulative loss tolerance
    const thirdSwapIncomingAssetAmounts = zeroSlippageIncomingAssetAmounts.map((amount) =>
      amount
        .mul(BigNumber.from(ONE_HUNDRED_PERCENT_IN_WEI).sub(ONE_ONE_HUNDREDTH_PERCENT_IN_WEI))
        .div(ONE_HUNDRED_PERCENT_IN_WEI),
    );

    // Swap should fail as tolerance is exceeded
    await expect(
      mockGenericSwap({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        mockGenericAdapter,
        spendAssets: outgoingAssets,
        actualSpendAssetAmounts: outgoingAssetAmounts,
        incomingAssets,
        actualIncomingAssetAmounts: thirdSwapIncomingAssetAmounts,
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: CUMULATIVE_SLIPPAGE_TOLERANCE');
  });

  it('happy path: allows bypassing an adapter in the "bypassable adapters" registered list', async () => {
    const addressListRegistry = fork.deployment.addressListRegistry;

    const outgoingAsset = new StandardToken(fork.config.primitives.mln, whales.mln);
    const outgoingAssetAmount = await getAssetUnit(outgoingAsset);
    await addNewAssetsToFund({
      signer: fundOwner,
      comptrollerProxy,
      integrationManager,
      assets: [outgoingAsset],
      amounts: [outgoingAssetAmount],
    });

    await expect(
      mockGenericSwap({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        mockGenericAdapter,
        spendAssets: [outgoingAsset],
        actualSpendAssetAmounts: [outgoingAssetAmount],
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: CUMULATIVE_SLIPPAGE_TOLERANCE');

    // Add the MockGenericAdapter to the list
    const listId = await cumulativeSlippageTolerancePolicy.getBypassableAdaptersListId();
    await addressListRegistry.addToList(listId, [mockGenericAdapter]);

    // Same swap should now work
    await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets: [outgoingAsset],
      actualSpendAssetAmounts: [outgoingAssetAmount],
    });

    // State should not be updated
    expect(
      (await cumulativeSlippageTolerancePolicy.getPolicyInfoForFund(comptrollerProxy)).cumulativeSlippage,
    ).toEqBigNumber(0);
  });

  it('happy path: edge case: allows bypassing a properly-queued outgoing asset that does not have a valid price', async () => {
    const outgoingAsset = new StandardToken(fork.config.primitives.mln, whales.mln);
    const outgoingAssetAmount = await getAssetUnit(outgoingAsset);
    await addNewAssetsToFund({
      signer: fundOwner,
      comptrollerProxy,
      integrationManager,
      assets: [outgoingAsset],
      amounts: [outgoingAssetAmount],
    });

    await fork.deployment.valueInterpreter.removePrimitives([outgoingAsset]);

    await expect(
      mockGenericSwap({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        mockGenericAdapter,
        spendAssets: [outgoingAsset],
        actualSpendAssetAmounts: [outgoingAssetAmount],
      }),
    ).rejects.toBeRevertedWith('Invalid asset not bypassable');

    await vaultCallStartAssetBypassTimelock({
      comptrollerProxy,
      contract: cumulativeSlippageTolerancePolicy,
      asset: outgoingAsset,
    });

    // Same swap should work within the allowed asset bypass window
    await provider.send('evm_increaseTime', [
      (await cumulativeSlippageTolerancePolicy.getPricelessAssetBypassTimelock()).toNumber(),
    ]);

    await mockGenericSwap({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      mockGenericAdapter,
      spendAssets: [outgoingAsset],
      actualSpendAssetAmounts: [outgoingAssetAmount],
    });

    // State should not be updated
    expect(
      (await cumulativeSlippageTolerancePolicy.getPolicyInfoForFund(comptrollerProxy)).cumulativeSlippage,
    ).toEqBigNumber(0);
  });
});
