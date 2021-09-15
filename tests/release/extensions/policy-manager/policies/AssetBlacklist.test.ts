import { randomAddress } from '@enzymefinance/ethers';
import {
  addTrackedAssetsArgs,
  addTrackedAssetsSelector,
  AssetBlacklist,
  assetBlacklistArgs,
  callOnIntegrationArgs,
  ComptrollerLib,
  IntegrationManagerActionId,
  PolicyHook,
  policyManagerConfigArgs,
  StandardToken,
  validateRulePostCoIArgs,
  VaultLib,
  WETH,
} from '@enzymefinance/protocol';
import {
  assertEvent,
  createNewFund,
  createMigratedFundConfig,
  createFundDeployer,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
import { utils, constants } from 'ethers';

async function snapshot() {
  const {
    deployer,
    accounts: [EOAPolicyManager, ...remainingAccounts],
    deployment,
    config,
  } = await deployProtocolFixture();
  const denominationAssetAddress = randomAddress();

  // Mock the ComptrollerProxy and VaultProxy
  const mockVaultProxy = await VaultLib.mock(deployer);
  await mockVaultProxy.getTrackedAssets.returns([]);

  const mockComptrollerProxy = await ComptrollerLib.mock(deployer);
  await mockComptrollerProxy.getDenominationAsset.returns(denominationAssetAddress);
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);

  const assetBlacklist = await AssetBlacklist.deploy(deployer, EOAPolicyManager);
  const blacklistedAssets = [randomAddress(), randomAddress()];
  const permissionedAssetBlacklist = assetBlacklist.connect(EOAPolicyManager);
  const assetBlacklistConfig = assetBlacklistArgs(blacklistedAssets);
  await permissionedAssetBlacklist.addFundSettings(mockComptrollerProxy, assetBlacklistConfig);

  return {
    deployer,
    accounts: remainingAccounts,
    deployment,
    config,
    assetBlacklist,
    blacklistedAssets,
    permissionedAssetBlacklist,
    denominationAssetAddress,
    EOAPolicyManager,
    mockComptrollerProxy,
    mockVaultProxy,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { policyManager, assetBlacklist },
    } = await provider.snapshot(snapshot);

    const policyManagerResult = await assetBlacklist.getPolicyManager();
    expect(policyManagerResult).toMatchAddress(policyManager);

    const implementedHooksResult = await assetBlacklist.implementedHooks();
    expect(implementedHooksResult).toMatchObject([PolicyHook.PostCallOnIntegration]);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const { assetBlacklist, blacklistedAssets, mockComptrollerProxy } = await provider.snapshot(snapshot);

    const assetBlacklistConfig = assetBlacklistArgs(blacklistedAssets);

    await expect(assetBlacklist.addFundSettings(mockComptrollerProxy, assetBlacklistConfig)).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('does not allow the denomination asset to be blacklisted', async () => {
    const { assetBlacklist, blacklistedAssets, denominationAssetAddress, mockComptrollerProxy, EOAPolicyManager } =
      await provider.snapshot(snapshot);

    const assetBlacklistConfig = assetBlacklistArgs([...blacklistedAssets, denominationAssetAddress]);

    await expect(
      assetBlacklist.connect(EOAPolicyManager).addFundSettings(mockComptrollerProxy, assetBlacklistConfig),
    ).rejects.toBeRevertedWith('Cannot blacklist denominationAsset');
  });

  it('sets initial config values for fund and fires events', async () => {
    const { assetBlacklist, blacklistedAssets, mockComptrollerProxy, EOAPolicyManager } = await provider.snapshot(
      snapshot,
    );

    const extraBlacklistedAssets = [randomAddress(), randomAddress()];
    const assetBlacklistConfig = assetBlacklistArgs(extraBlacklistedAssets);
    const receipt = await assetBlacklist
      .connect(EOAPolicyManager)
      .addFundSettings(mockComptrollerProxy, assetBlacklistConfig);

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy: mockComptrollerProxy,
      items: extraBlacklistedAssets,
    });

    // List should be the blacklisted assets
    const getListCall = await assetBlacklist.getList(mockComptrollerProxy);
    expect(getListCall).toMatchObject(blacklistedAssets.concat(extraBlacklistedAssets));
  });
});

describe('updateFundSettings', () => {
  it('cannot be called', async () => {
    const { assetBlacklist } = await provider.snapshot(snapshot);

    await expect(assetBlacklist.updateFundSettings(randomAddress(), randomAddress(), '0x')).rejects.toBeRevertedWith(
      'Updates not allowed for this policy',
    );
  });
});

describe('activateForFund', () => {
  it('does not allow a blacklisted asset in the fund trackedAssets', async () => {
    const { permissionedAssetBlacklist, blacklistedAssets, mockComptrollerProxy, mockVaultProxy } =
      await provider.snapshot(snapshot);

    // Activation should pass if a blacklisted asset is not a trackedAsset
    await mockVaultProxy.getTrackedAssets.returns([randomAddress()]);

    await expect(
      permissionedAssetBlacklist.activateForFund(mockComptrollerProxy, mockVaultProxy),
    ).resolves.toBeReceipt();

    // Setting a blacklistedAsset as a trackedAsset should make activation fail
    await mockVaultProxy.getTrackedAssets.returns([randomAddress(), blacklistedAssets[0]]);

    await expect(
      permissionedAssetBlacklist.activateForFund(mockComptrollerProxy, mockVaultProxy),
    ).rejects.toBeRevertedWith('Blacklisted asset detected');
  });
});

describe('validateRule', () => {
  it('returns false if an asset is in the blacklist', async () => {
    const { assetBlacklist, blacklistedAssets, mockComptrollerProxy, mockVaultProxy } = await provider.snapshot(
      snapshot,
    );

    // Only the incoming assets arg matters for this policy
    const postCoIArgs = validateRulePostCoIArgs({
      adapter: constants.AddressZero,
      selector: utils.randomBytes(4),
      incomingAssets: [blacklistedAssets[0]], // bad incoming asset
      incomingAssetAmounts: [],
      outgoingAssets: [],
      outgoingAssetAmounts: [],
    });

    const validateRuleResult = await assetBlacklist.validateRule
      .args(mockComptrollerProxy, mockVaultProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
      .call();

    expect(validateRuleResult).toBeFalsy();
  });

  it('returns true if an asset is not in the blacklist', async () => {
    const { assetBlacklist, mockComptrollerProxy, mockVaultProxy } = await provider.snapshot(snapshot);

    // Only the incoming assets arg matters for this policy
    const postCoIArgs = validateRulePostCoIArgs({
      adapter: constants.AddressZero,
      selector: utils.randomBytes(4),
      incomingAssets: [randomAddress()], // bad incoming asset
      incomingAssetAmounts: [],
      outgoingAssets: [],
      outgoingAssetAmounts: [],
    });

    const validateRuleResult = await assetBlacklist.validateRule
      .args(mockComptrollerProxy, mockVaultProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
      .call();

    expect(validateRuleResult).toBeTruthy();
  });
});

describe('integration tests', () => {
  it('can create a new fund with this policy, and it works correctly during callOnIntegration', async () => {
    const {
      accounts: [fundOwner],
      config: {
        weth,
        primitives: { mln },
      },
      deployment: { trackedAssetsAdapter, fundDeployer, assetBlacklist, integrationManager },
    } = await provider.snapshot(snapshot);

    const denominationAsset = new WETH(weth, whales.weth);
    const incomingAsset = new StandardToken(mln, whales.mln);

    // declare variables for policy config
    const assetBlacklistAddresses = [incomingAsset.address];
    const assetBlacklistSettings = assetBlacklistArgs(assetBlacklistAddresses);
    const policyManagerConfig = policyManagerConfigArgs({
      policies: [assetBlacklist.address],
      settings: [assetBlacklistSettings],
    });

    // create new fund with policy as above
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'Test Fund!',
      policyManagerConfig,
    });

    // confirm a blacklisted asset is not allowed
    const incomingAssetAmount = utils.parseEther('50');
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

    await expect(addTrackedAssetsTx).rejects.toBeRevertedWith('Rule evaluated to false: ASSET_BLACKLIST');
  });

  it('can create a migrated fund with this policy', async () => {
    const {
      accounts: [fundOwner],
      deployer,
      config: {
        weth,
        primitives: { mln },
        synthetix: { addressResolver: synthetixAddressResolverAddress },
      },
      deployment: {
        chainlinkPriceFeed,
        dispatcher,
        feeManager,
        fundDeployer,
        integrationManager,
        policyManager,
        synthetixPriceFeed,
        valueInterpreter,
        vaultLib,
        assetBlacklist,
        trackedAssetsAdapter,
      },
    } = await provider.snapshot(snapshot);

    const denominationAsset = new WETH(weth, whales.weth);
    const incomingAsset = new StandardToken(mln, whales.mln);

    const assetBlacklistAddresses = [incomingAsset.address];
    const assetBlacklistSettings = assetBlacklistArgs(assetBlacklistAddresses);
    const policyManagerConfig = policyManagerConfigArgs({
      policies: [assetBlacklist.address],
      settings: [assetBlacklistSettings],
    });

    // create new fund with policy as above
    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'Test Fund!',
      policyManagerConfig,
    });

    // migrate fund
    const nextFundDeployer = await createFundDeployer({
      deployer,
      chainlinkPriceFeed,
      dispatcher,
      feeManager,
      integrationManager,
      policyManager,
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

    // Warp to migratable time
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    // Migration execution settles the accrued fee
    await signedNextFundDeployer.executeMigration(vaultProxy);

    // confirm a blacklisted asset is not allowed
    const incomingAssetAmount = utils.parseEther('50');
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

    await expect(addTrackedAssetsTx).rejects.toBeRevertedWith('Rule evaluated to false: ASSET_BLACKLIST');
  });
});
