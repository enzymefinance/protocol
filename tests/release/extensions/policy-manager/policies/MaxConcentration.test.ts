import { AddressLike, MockContract, randomAddress } from '@enzymefinance/ethers';
import {
  StandardToken,
  ComptrollerLib,
  MaxConcentration,
  ValueInterpreter,
  maxConcentrationArgs,
  PolicyHook,
  validateRulePostCoIArgs,
  policyManagerConfigArgs,
  addTrackedAssetsArgs,
  callOnIntegrationArgs,
  addTrackedAssetsSelector,
  IntegrationManagerActionId,
  VaultLib,
  WETH,
} from '@enzymefinance/protocol';
import {
  assertEvent,
  createNewFund,
  createFundDeployer,
  createMigratedFundConfig,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
import { BigNumber, BigNumberish, constants, utils } from 'ethers';

async function snapshot() {
  const {
    accounts: [EOAPolicyManager, ...remainingAccounts],
    deployment,
    config,
    deployer,
  } = await deployProtocolFixture();

  const weth = new WETH(config.weth, whales.weth);
  const mln = new StandardToken(config.primitives.mln, whales.mln);

  const maxConcentrationValue = utils.parseEther('.1'); // 10%

  // Mock the ValueInterpreter
  const mockValueInterpreter = await ValueInterpreter.mock(deployer);
  await mockValueInterpreter.calcLiveAssetValue.returns(0, false);

  // Deploy the standalone MaxConcentration policy
  const maxConcentration = await MaxConcentration.deploy(deployer, EOAPolicyManager, mockValueInterpreter);

  // Define mock fund values and calculate the limit of assetGav based on the maxConcentration
  const totalGav = utils.parseEther('1');
  const assetGavLimit = BigNumber.from(totalGav).mul(maxConcentrationValue).div(utils.parseEther('1'));
  expect(assetGavLimit).toEqBigNumber(utils.parseEther('0.1'));

  // Mock the VaultProxy
  const mockVaultProxy = await VaultLib.mock(deployer);
  await mockVaultProxy.getTrackedAssets.returns([]);

  // Mock the ComptrollerProxy
  const mockComptrollerProxy = await ComptrollerLib.mock(deployer);
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);
  await mockComptrollerProxy.calcGav.returns(totalGav, true);
  await mockComptrollerProxy.getDenominationAsset.returns(weth);

  // Add policy settings for ComptrollerProxy
  const maxConcentrationConfig = maxConcentrationArgs(maxConcentrationValue);
  await maxConcentration.connect(EOAPolicyManager).addFundSettings(mockComptrollerProxy, maxConcentrationConfig);

  return {
    config,
    weth,
    mln,
    deployer,
    accounts: remainingAccounts,
    assetGavLimit,
    deployment,
    maxConcentration,
    maxConcentrationValue,
    EOAPolicyManager,
    mockComptrollerProxy,
    mockValueInterpreter,
    mockVaultProxy,
  };
}

async function mockValuesAndValidateRule({
  mockComptrollerProxy,
  mockVaultProxy,
  mockValueInterpreter,
  maxConcentration,
  incomingAsset,
  incomingAssetGav,
  assetValueIsValid = true,
}: {
  mockComptrollerProxy: MockContract<ComptrollerLib>;
  mockVaultProxy: AddressLike;
  mockValueInterpreter: MockContract<ValueInterpreter>;
  maxConcentration: MaxConcentration;
  incomingAsset: StandardToken;
  incomingAssetGav: BigNumberish;
  assetValueIsValid?: boolean;
}) {
  // Send assetGavLimit of the incomingAsset to vault
  await incomingAsset.transfer(mockVaultProxy, incomingAssetGav);

  // Set value interpreter to return hardcoded amount
  await mockValueInterpreter.calcLiveAssetValue.returns(incomingAssetGav, assetValueIsValid);

  // Only the incoming assets arg matters for this policy
  const postCoIArgs = validateRulePostCoIArgs({
    adapter: constants.AddressZero,
    selector: utils.randomBytes(4),
    incomingAssets: [incomingAsset],
    incomingAssetAmounts: [],
    outgoingAssets: [],
    outgoingAssetAmounts: [],
  });

  return maxConcentration.validateRule
    .args(
      mockComptrollerProxy,
      await mockComptrollerProxy.getVaultProxy(),
      PolicyHook.PostCallOnIntegration,
      postCoIArgs,
    )
    .call();
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { policyManager, maxConcentration },
    } = await provider.snapshot(snapshot);

    const getPolicyManagerCall = await maxConcentration.getPolicyManager();
    expect(getPolicyManagerCall).toMatchAddress(policyManager);

    const implementedHooksCall = await maxConcentration.implementedHooks();
    expect(implementedHooksCall).toMatchObject([PolicyHook.PostCallOnIntegration]);
  });
});

describe('activateForFund', () => {
  it('does only allow a misc asset with balance <maxConcentration in the fund trackedAssets', async () => {
    const {
      mln: incomingAsset,
      mockValueInterpreter,
      mockComptrollerProxy,
      mockVaultProxy,
      maxConcentration,
      EOAPolicyManager,
      assetGavLimit,
    } = await provider.snapshot(snapshot);

    // track "incoming asset" and "denomination asset" in the mocked vault proxy
    await mockVaultProxy.getTrackedAssets.returns([incomingAsset]);

    // set value interpreter to return exactly the configured asset gav limit.
    await mockValueInterpreter.calcLiveAssetValue.returns(assetGavLimit, true);

    // should pass because assetGavLimit is still within the allowed range.
    await expect(
      maxConcentration.connect(EOAPolicyManager).activateForFund(mockComptrollerProxy, mockVaultProxy),
    ).resolves.toBeReceipt();

    // set value interpreter to return an amount that exceeds the asset gav limit.
    await mockValueInterpreter.calcLiveAssetValue.returns(assetGavLimit.add(1), true);

    // should fail because "incoming asset" is not the denomination asset and exceeds the limit
    await expect(
      maxConcentration.connect(EOAPolicyManager).activateForFund(mockComptrollerProxy, mockVaultProxy),
    ).rejects.toBeRevertedWith('activateForFund: Max concentration exceeded');
  });

  it('allows the denomination asset to have >maxConcentration', async () => {
    const {
      assetGavLimit,
      mockValueInterpreter,
      mockComptrollerProxy,
      mockVaultProxy,
      maxConcentration,
      EOAPolicyManager,
      weth: denominationAsset,
    } = await provider.snapshot(snapshot);

    // track "denomination asset" in the mocked vault proxy
    await mockVaultProxy.getTrackedAssets.returns([denominationAsset]);

    // set value interpreter to return an amount that exceeds the asset gav limit.
    await mockValueInterpreter.calcLiveAssetValue.returns(assetGavLimit.add(1), true);

    // send denomination asset to fund with maxConcentration in amount assetGavLimit plus 1
    await maxConcentration.connect(EOAPolicyManager).activateForFund(mockComptrollerProxy, mockVaultProxy);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const { maxConcentration, maxConcentrationValue } = await provider.snapshot(snapshot);

    const maxConcentrationConfig = maxConcentrationArgs(maxConcentrationValue);

    await expect(maxConcentration.addFundSettings(randomAddress(), maxConcentrationConfig)).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const { maxConcentration, maxConcentrationValue, EOAPolicyManager } = await provider.snapshot(snapshot);

    const comptrollerProxy = randomAddress();

    const maxConcentrationConfig = maxConcentrationArgs(maxConcentrationValue);
    const receipt = await maxConcentration
      .connect(EOAPolicyManager)
      .addFundSettings(comptrollerProxy, maxConcentrationConfig);

    // Assert the MaxConcentrationSet event was emitted
    assertEvent(receipt, 'MaxConcentrationSet', {
      comptrollerProxy: comptrollerProxy,
      value: maxConcentrationValue,
    });

    // maxConcentration should be set for comptrollerProxy
    const getMaxConcentrationForFundCall = await maxConcentration.getMaxConcentrationForFund(comptrollerProxy);
    expect(getMaxConcentrationForFundCall).toEqBigNumber(maxConcentrationValue);
  });
});

describe('updateFundSettings', () => {
  it('cannot be called', async () => {
    const { maxConcentration } = await provider.snapshot(snapshot);

    await expect(maxConcentration.updateFundSettings(randomAddress(), randomAddress(), '0x')).rejects.toBeRevertedWith(
      'Updates not allowed for this policy',
    );
  });
});

describe('validateRule', () => {
  it('returns true if there are no incoming assets', async () => {
    const { maxConcentration, mockComptrollerProxy } = await provider.snapshot(snapshot);

    // Empty args
    const postCoIArgs = validateRulePostCoIArgs({
      adapter: constants.AddressZero,
      selector: utils.randomBytes(4),
      incomingAssets: [],
      incomingAssetAmounts: [],
      outgoingAssets: [],
      outgoingAssetAmounts: [],
    });

    const validateRuleCall = await maxConcentration.validateRule
      .args(
        mockComptrollerProxy,
        await mockComptrollerProxy.getVaultProxy(),
        PolicyHook.PostCallOnIntegration,
        postCoIArgs,
      )
      .call();

    expect(validateRuleCall).toBeTruthy();
  });

  it('properly queries live rates', async () => {
    const {
      mln: incomingAsset,
      weth: denominationAsset,
      assetGavLimit: incomingAssetGav,
      maxConcentration,
      mockComptrollerProxy,
      mockValueInterpreter,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    await mockValuesAndValidateRule({
      mockComptrollerProxy,
      mockVaultProxy,
      mockValueInterpreter,
      maxConcentration,
      incomingAsset,
      incomingAssetGav,
    });

    expect(mockValueInterpreter.calcLiveAssetValue).toHaveBeenCalledOnContractWith(
      incomingAsset,
      incomingAssetGav,
      denominationAsset,
    );
  });

  it('returns true if the incoming asset gav is exactly the threshold amount', async () => {
    const {
      mln: incomingAsset,
      assetGavLimit: incomingAssetGav,
      maxConcentration,
      mockComptrollerProxy,
      mockValueInterpreter,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    const validateRuleCall = await mockValuesAndValidateRule({
      mockComptrollerProxy,
      mockVaultProxy,
      mockValueInterpreter,
      maxConcentration,
      incomingAsset,
      incomingAssetGav,
    });

    expect(validateRuleCall).toBeTruthy();
  });

  it('returns false if the incoming asset gav is slightly over the threshold amount', async () => {
    const {
      mln: incomingAsset,
      assetGavLimit,
      maxConcentration,
      mockComptrollerProxy,
      mockValueInterpreter,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    // Increase incoming asset balance to be 1 wei over the limit
    const validateRuleCall = await mockValuesAndValidateRule({
      mockComptrollerProxy,
      mockVaultProxy,
      mockValueInterpreter,
      maxConcentration,
      incomingAsset,
      incomingAssetGav: BigNumber.from(assetGavLimit).add(1),
    });

    expect(validateRuleCall).toBeFalsy();
  });

  it('returns true if the incoming asset is the denomination asset', async () => {
    const {
      assetGavLimit,
      weth: incomingAsset,
      maxConcentration,
      mockComptrollerProxy,
      mockValueInterpreter,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    // Increase incoming asset balance to be 1 wei over the limit
    const validateRuleCall = await mockValuesAndValidateRule({
      mockComptrollerProxy,
      mockVaultProxy,
      mockValueInterpreter,
      maxConcentration,
      incomingAsset,
      incomingAssetGav: BigNumber.from(assetGavLimit).add(1),
    });

    expect(validateRuleCall).toBeTruthy();
  });

  it('returns false if the asset value lookup is invalid', async () => {
    const {
      mln: incomingAsset,
      assetGavLimit: incomingAssetGav,
      maxConcentration,
      mockComptrollerProxy,
      mockValueInterpreter,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    const validateRuleCall = await mockValuesAndValidateRule({
      mockComptrollerProxy,
      mockVaultProxy,
      mockValueInterpreter,
      maxConcentration,
      incomingAsset,
      incomingAssetGav,
      assetValueIsValid: false,
    });

    expect(validateRuleCall).toBeFalsy();
  });
});

describe('integration tests', () => {
  it('can create a new fund with this policy, and it works correctly during callOnIntegration', async () => {
    const {
      accounts: [fundOwner],
      weth: denominationAsset,
      mln: incomingAsset,
      deployment: { fundDeployer, maxConcentration, trackedAssetsAdapter, integrationManager },
    } = await provider.snapshot(snapshot);

    // configure policy
    const maxConcentrationRate = utils.parseEther('.1'); // 10%
    const maxConcentrationSettings = maxConcentrationArgs(maxConcentrationRate);
    const policyManagerConfig = policyManagerConfigArgs({
      policies: [maxConcentration],
      settings: [maxConcentrationSettings],
    });

    // spin up fund
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'TestFund',
      policyManagerConfig,
    });

    const incomingAssetAmount = BigNumber.from(50);
    // Send incomingAsset to vault
    await incomingAsset.transfer(vaultProxy.address, incomingAssetAmount);

    // track it and expect to fail
    const trackedAssetArgs = addTrackedAssetsArgs([incomingAsset]);
    const trackedAssetCallArgs = callOnIntegrationArgs({
      adapter: trackedAssetsAdapter,
      selector: addTrackedAssetsSelector,
      encodedCallArgs: trackedAssetArgs,
    });

    const addTrackedAssetsTx = comptrollerProxy
      .connect(fundOwner)
      .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, trackedAssetCallArgs);

    await expect(addTrackedAssetsTx).rejects.toBeRevertedWith('Rule evaluated to false: MAX_CONCENTRATION');
  });

  it('can create a migrated fund with this policy', async () => {
    const {
      accounts: [fundOwner],
      deployer,
      config: {
        synthetix: { addressResolver: synthetixAddressResolverAddress },
      },
      deployment: {
        maxConcentration,
        trackedAssetsAdapter,
        feeManager,
        chainlinkPriceFeed,
        dispatcher,
        fundDeployer,
        integrationManager,
        policyManager,
        synthetixPriceFeed,
        valueInterpreter,
        vaultLib,
      },
      weth: denominationAsset,
      mln: incomingAsset,
    } = await provider.snapshot(snapshot);

    // configure policy
    const maxConcentrationRate = utils.parseEther('.1'); // 10%
    const maxConcentrationSettings = maxConcentrationArgs(maxConcentrationRate);
    const policyManagerConfig = policyManagerConfigArgs({
      policies: [maxConcentration],
      settings: [maxConcentrationSettings],
    });

    // spin up fund
    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'TestFund',
      policyManagerConfig,
    });

    // migrate fund
    const nextFundDeployer = await createFundDeployer({
      deployer,
      chainlinkPriceFeed,
      dispatcher,
      policyManager,
      feeManager,
      integrationManager,
      synthetixPriceFeed,
      synthetixAddressResolverAddress,
      valueInterpreter,
      vaultLib,
    });

    const { comptrollerProxy: nextComptrollerProxy } = await createMigratedFundConfig({
      signer: fundOwner,
      fundDeployer: nextFundDeployer,
      denominationAsset,
      policyManagerConfigData: policyManagerConfig,
    });

    const signedNextFundDeployer = nextFundDeployer.connect(fundOwner);
    await signedNextFundDeployer.signalMigration(vaultProxy, nextComptrollerProxy);

    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    await signedNextFundDeployer.executeMigration(vaultProxy);

    const incomingAssetAmount = BigNumber.from(50);
    // Send incomingAsset to vault
    await incomingAsset.transfer(vaultProxy.address, incomingAssetAmount);

    // track it and expect to fail
    const trackedAssetArgs = addTrackedAssetsArgs([incomingAsset]);
    const trackedAssetCallArgs = callOnIntegrationArgs({
      adapter: trackedAssetsAdapter,
      selector: addTrackedAssetsSelector,
      encodedCallArgs: trackedAssetArgs,
    });

    const addTrackedAssetsTx = nextComptrollerProxy
      .connect(fundOwner)
      .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, trackedAssetCallArgs);

    await expect(addTrackedAssetsTx).rejects.toBeRevertedWith('Rule evaluated to false: MAX_CONCENTRATION');
  });
});
