import { randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  ComptrollerLib,
  CumulativeSlippageTolerancePolicy,
  IntegrationManager,
  ValueInterpreter,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  cumulativeSlippageTolerancePolicyArgs,
  FIVE_PERCENT_IN_WEI,
  ITestStandardToken,
  MockGenericAdapter,
  MockGenericIntegratee,
  ONE_DAY_IN_SECONDS,
  ONE_HUNDRED_PERCENT_IN_WEI,
  ONE_ONE_HUNDREDTH_PERCENT_IN_WEI,
  PolicyHook,
  policyManagerConfigArgs,
  TEN_PERCENT_IN_WEI,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  addNewAssetsToFund,
  assertEvent,
  buyShares,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  mockGenericSwap,
  setAccountBalance,
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
        denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner,
        policyManagerConfig: policyManagerConfigArgs({
          policies: [cumulativeSlippageTolerancePolicy],
          settings: [
            cumulativeSlippageTolerancePolicyArgs({
              tolerance: ONE_HUNDRED_PERCENT_IN_WEI,
            }),
          ],
        }),
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Max tolerance exceeded');
  });

  it('happy path', async () => {
    const tolerance = 9999;
    const { comptrollerProxy, receipt } = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [cumulativeSlippageTolerancePolicy],
        settings: [
          cumulativeSlippageTolerancePolicyArgs({
            tolerance,
          }),
        ],
      }),
      signer: fundOwner,
    });

    // Assert state
    expect(await cumulativeSlippageTolerancePolicy.getPolicyInfoForFund(comptrollerProxy)).toMatchFunctionOutput(
      cumulativeSlippageTolerancePolicy.getPolicyInfoForFund,
      {
        cumulativeSlippage: BigNumber.from(0),
        lastSlippageTimestamp: BigNumber.from(0),
        tolerance,
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
  let denominationAsset: ITestStandardToken;

  beforeEach(async () => {
    [fundOwner] = fork.accounts;
    cumulativeSlippageTolerancePolicy = fork.deployment.cumulativeSlippageTolerancePolicy;
    integrationManager = fork.deployment.integrationManager;
    valueInterpreter = fork.deployment.valueInterpreter;

    mockGenericIntegratee = await MockGenericIntegratee.deploy(fork.deployer);
    mockGenericAdapter = await MockGenericAdapter.deploy(fork.deployer, mockGenericIntegratee);

    denominationAsset = new ITestStandardToken(fork.config.primitives.usdc, provider);

    const newFundRes = await createNewFund({
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [cumulativeSlippageTolerancePolicy],
        settings: [
          cumulativeSlippageTolerancePolicyArgs({
            tolerance,
          }),
        ],
      }),
      signer: fundOwner,
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
    const incomingAsset = new ITestStandardToken(fork.config.primitives.dai, provider);

    const outgoingAssetUnit = await getAssetUnit(outgoingAsset);

    // Use same outgoingAssetAmount throughout
    const outgoingAssetAmount = outgoingAssetUnit.mul(100);
    // Rounds amount down, so should be slightly less or equal to the outgoingAssetAmount
    const zeroSlippageIncomingAssetAmount = await valueInterpreter.calcCanonicalAssetValue
      .args(outgoingAsset, outgoingAssetAmount, incomingAsset)
      .call();

    // Seed mock generic integratee with incoming assets
    await setAccountBalance({
      account: mockGenericIntegratee,
      amount: zeroSlippageIncomingAssetAmount.mul(10),
      provider,
      token: incomingAsset,
    });

    // Buy shares to seed fund with denomination asset
    await buyShares({
      provider,
      buyer: fundOwner,
      comptrollerProxy,
      denominationAsset,
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
      provider,
      actualIncomingAssetAmounts: [firstSwapIncomingAssetAmount],
      actualSpendAssetAmounts: [outgoingAssetAmount],
      comptrollerProxy,
      signer: fundOwner,
      incomingAssets: [incomingAsset],
      integrationManager,
      mockGenericAdapter,
      spendAssets: [outgoingAsset],
      vaultProxy,
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
        provider,
        actualIncomingAssetAmounts: [secondSwapIncomingAssetAmount],
        actualSpendAssetAmounts: [outgoingAssetAmount],
        comptrollerProxy,
        signer: fundOwner,
        incomingAssets: [incomingAsset],
        integrationManager,
        mockGenericAdapter,
        spendAssets: [outgoingAsset],
        vaultProxy,
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: CUMULATIVE_SLIPPAGE_TOLERANCE');

    // Wait for half of the tolerance period duration to forgive half of tolerance limit
    await provider.send('evm_increaseTime', [
      BigNumber.from(await cumulativeSlippageTolerancePolicy.getTolerancePeriodDuration())
        .div(2)
        .toNumber(),
    ]);

    const secondSwapReceipt = await mockGenericSwap({
      provider,
      actualIncomingAssetAmounts: [secondSwapIncomingAssetAmount],
      actualSpendAssetAmounts: [outgoingAssetAmount],
      comptrollerProxy,
      signer: fundOwner,
      incomingAssets: [incomingAsset],
      integrationManager,
      mockGenericAdapter,
      spendAssets: [outgoingAsset],
      vaultProxy,
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
    const secondSpendAsset = new ITestStandardToken(fork.config.weth, provider);
    const secondSpendAssetUnit = await getAssetUnit(secondSpendAsset);
    const outgoingAssets = [denominationAsset, secondSpendAsset];
    const outgoingAssetUnits = [await getAssetUnit(denominationAsset), secondSpendAssetUnit];
    const incomingAssets = [
      new ITestStandardToken(fork.config.primitives.usdt, provider),
      new ITestStandardToken(fork.config.primitives.dai, provider),
    ];

    // Use same outgoingAssetAmounts throughout
    const outgoingAssetAmounts = outgoingAssetUnits.map((asset) => asset.mul(3));

    // Add outgoing assets to fund
    await addNewAssetsToFund({
      provider,
      amounts: outgoingAssetAmounts.map((amount) => amount.mul(10)),
      assets: outgoingAssets,
      comptrollerProxy,
      integrationManager,
      signer: fundOwner,
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
      await setAccountBalance({
        account: mockGenericIntegratee,
        amount: zeroSlippageIncomingAssetAmounts[i].mul(10),
        provider,
        token: incomingAssets[i],
      });
    }

    // FIRST SWAP - Approx tolerance limit (each rounded up)
    const firstSwapIncomingAssetAmounts = zeroSlippageIncomingAssetAmounts.map((amount) =>
      amount.mul(BigNumber.from(ONE_HUNDRED_PERCENT_IN_WEI).sub(tolerance)).div(ONE_HUNDRED_PERCENT_IN_WEI).add(2),
    );
    const firstSwapReceipt = await mockGenericSwap({
      provider,
      actualIncomingAssetAmounts: firstSwapIncomingAssetAmounts,
      actualSpendAssetAmounts: outgoingAssetAmounts,
      comptrollerProxy,
      signer: fundOwner,
      incomingAssets,
      integrationManager,
      mockGenericAdapter,
      spendAssets: outgoingAssets,
      vaultProxy,
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
      provider,
      actualIncomingAssetAmounts: secondSwapIncomingAssetAmounts,
      actualSpendAssetAmounts: outgoingAssetAmounts,
      comptrollerProxy,
      signer: fundOwner,
      incomingAssets,
      integrationManager,
      mockGenericAdapter,
      spendAssets: outgoingAssets,
      vaultProxy,
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
        provider,
        actualIncomingAssetAmounts: thirdSwapIncomingAssetAmounts,
        actualSpendAssetAmounts: outgoingAssetAmounts,
        comptrollerProxy,
        signer: fundOwner,
        incomingAssets,
        integrationManager,
        mockGenericAdapter,
        spendAssets: outgoingAssets,
        vaultProxy,
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: CUMULATIVE_SLIPPAGE_TOLERANCE');
  });

  it('happy path: allows bypassing an adapter in the "bypassable adapters" registered list', async () => {
    const addressListRegistry = fork.deployment.addressListRegistry;

    const outgoingAsset = new ITestStandardToken(fork.config.primitives.mln, provider);
    const outgoingAssetAmount = await getAssetUnit(outgoingAsset);

    await addNewAssetsToFund({
      provider,
      amounts: [outgoingAssetAmount],
      assets: [outgoingAsset],
      comptrollerProxy,
      integrationManager,
      signer: fundOwner,
    });

    await expect(
      mockGenericSwap({
        provider,
        actualSpendAssetAmounts: [outgoingAssetAmount],
        comptrollerProxy,
        signer: fundOwner,
        integrationManager,
        mockGenericAdapter,
        spendAssets: [outgoingAsset],
        vaultProxy,
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: CUMULATIVE_SLIPPAGE_TOLERANCE');

    // Add the MockGenericAdapter to the list
    const listId = await cumulativeSlippageTolerancePolicy.getBypassableAdaptersListId();

    await addressListRegistry.addToList(listId, [mockGenericAdapter]);

    // Same swap should now work
    await mockGenericSwap({
      provider,
      actualSpendAssetAmounts: [outgoingAssetAmount],
      comptrollerProxy,
      signer: fundOwner,
      integrationManager,
      mockGenericAdapter,
      spendAssets: [outgoingAsset],
      vaultProxy,
    });

    // State should not be updated
    expect(
      (await cumulativeSlippageTolerancePolicy.getPolicyInfoForFund(comptrollerProxy)).cumulativeSlippage,
    ).toEqBigNumber(0);
  });

  it('happy path: edge case: allows bypassing a properly-queued outgoing asset that does not have a valid price', async () => {
    const outgoingAsset = new ITestStandardToken(fork.config.primitives.mln, provider);
    const outgoingAssetAmount = await getAssetUnit(outgoingAsset);

    await addNewAssetsToFund({
      provider,
      amounts: [outgoingAssetAmount],
      assets: [outgoingAsset],
      comptrollerProxy,
      integrationManager,
      signer: fundOwner,
    });

    await fork.deployment.valueInterpreter.removePrimitives([outgoingAsset]);

    await expect(
      mockGenericSwap({
        provider,
        actualSpendAssetAmounts: [outgoingAssetAmount],
        comptrollerProxy,
        signer: fundOwner,
        integrationManager,
        mockGenericAdapter,
        spendAssets: [outgoingAsset],
        vaultProxy,
      }),
    ).rejects.toBeRevertedWith('Invalid asset not bypassable');

    await vaultCallStartAssetBypassTimelock({
      asset: outgoingAsset,
      comptrollerProxy,
      contract: cumulativeSlippageTolerancePolicy,
    });

    // Same swap should work within the allowed asset bypass window
    await provider.send('evm_increaseTime', [
      (await cumulativeSlippageTolerancePolicy.getPricelessAssetBypassTimelock()).toNumber(),
    ]);

    await mockGenericSwap({
      provider,
      actualSpendAssetAmounts: [outgoingAssetAmount],
      comptrollerProxy,
      signer: fundOwner,
      integrationManager,
      mockGenericAdapter,
      spendAssets: [outgoingAsset],
      vaultProxy,
    });

    // State should not be updated
    expect(
      (await cumulativeSlippageTolerancePolicy.getPolicyInfoForFund(comptrollerProxy)).cumulativeSlippage,
    ).toEqBigNumber(0);
  });
});
