import { constants, utils } from 'ethers';
import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import {
  AssetBlacklist,
  ComptrollerLib,
  VaultLib,
} from '@melonproject/protocol';
import {
  defaultTestDeployment,
  assertEvent,
  assetBlacklistArgs,
  policyHooks,
  validateRulePostCoIArgs,
} from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  return {
    accounts,
    deployment,
    config,
  };
}

async function snapshotWithStandalonePolicy(provider: EthereumTestnetProvider) {
  const { accounts, config } = await provider.snapshot(snapshot);

  const [EOAPolicyManager, ...remainingAccounts] = accounts;
  const assetBlacklist = await AssetBlacklist.deploy(
    config.deployer,
    EOAPolicyManager,
  );

  const denominationAssetAddress = randomAddress();

  // Mock the ComptrollerProxy and VaultProxy
  const mockVaultProxy = await VaultLib.mock(config.deployer);
  await mockVaultProxy.getTrackedAssets.returns([]);

  const mockComptrollerProxy = await ComptrollerLib.mock(config.deployer);
  await mockComptrollerProxy.getDenominationAsset.returns(
    denominationAssetAddress,
  );
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);

  return {
    accounts: remainingAccounts,
    assetBlacklist,
    blacklistedAssets: [randomAddress(), randomAddress()],
    denominationAssetAddress,
    EOAPolicyManager,
    mockComptrollerProxy,
    mockVaultProxy,
  };
}

async function snapshotWithConfiguredStandalonePolicy(
  provider: EthereumTestnetProvider,
) {
  const {
    accounts,
    assetBlacklist,
    blacklistedAssets,
    EOAPolicyManager,
    mockComptrollerProxy,
    mockVaultProxy,
  } = await provider.snapshot(snapshotWithStandalonePolicy);

  const permissionedAssetBlacklist = assetBlacklist.connect(EOAPolicyManager);
  const assetBlacklistConfig = await assetBlacklistArgs(blacklistedAssets);
  await permissionedAssetBlacklist.addFundSettings(
    mockComptrollerProxy,
    assetBlacklistConfig,
  );

  return {
    accounts,
    assetBlacklist: permissionedAssetBlacklist,
    blacklistedAssets,
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

    const getPolicyManagerCall = assetBlacklist.getPolicyManager();
    await expect(getPolicyManagerCall).resolves.toBe(policyManager.address);

    const implementedHooksCall = assetBlacklist.implementedHooks();
    await expect(implementedHooksCall).resolves.toMatchObject([
      policyHooks.PostCallOnIntegration,
    ]);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      assetBlacklist,
      blacklistedAssets,
      mockComptrollerProxy,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const assetBlacklistConfig = await assetBlacklistArgs(blacklistedAssets);
    const addFundSettingsTx = assetBlacklist.addFundSettings(
      mockComptrollerProxy,
      assetBlacklistConfig,
    );

    await expect(addFundSettingsTx).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('does not allow the denomination asset to be blacklisted', async () => {
    const {
      assetBlacklist,
      blacklistedAssets,
      denominationAssetAddress,
      mockComptrollerProxy,
      EOAPolicyManager,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const assetBlacklistConfig = await assetBlacklistArgs([
      ...blacklistedAssets,
      denominationAssetAddress,
    ]);
    const addFundSettingsTx = assetBlacklist
      .connect(EOAPolicyManager)
      .addFundSettings(mockComptrollerProxy, assetBlacklistConfig);

    await expect(addFundSettingsTx).rejects.toBeRevertedWith(
      'cannot blacklist denominationAsset',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const {
      assetBlacklist,
      blacklistedAssets,
      mockComptrollerProxy,
      EOAPolicyManager,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const assetBlacklistConfig = await assetBlacklistArgs(blacklistedAssets);
    const addFundSettingsTx = assetBlacklist
      .connect(EOAPolicyManager)
      .addFundSettings(mockComptrollerProxy, assetBlacklistConfig);

    // List should be the blacklisted assets
    const getListCall = assetBlacklist.getList(mockComptrollerProxy);
    await expect(getListCall).resolves.toMatchObject(blacklistedAssets);

    // Assert the AddressesAdded event was emitted
    await assertEvent(addFundSettingsTx, 'AddressesAdded', {
      comptrollerProxy: mockComptrollerProxy.address,
      items: blacklistedAssets,
    });
  });
});

describe('updateFundSettings', () => {
  it('cannot be called', async () => {
    const { assetBlacklist } = await provider.snapshot(
      snapshotWithStandalonePolicy,
    );

    const updateFundSettingsTx = assetBlacklist.updateFundSettings(
      randomAddress(),
      randomAddress(),
      '0x',
    );
    await expect(updateFundSettingsTx).rejects.toBeRevertedWith(
      'Updates not allowed for this policy',
    );
  });
});

describe('activateForFund', () => {
  it('does not allow a blacklisted asset in the fund trackedAssets', async () => {
    const {
      assetBlacklist,
      blacklistedAssets,
      mockComptrollerProxy,
      mockVaultProxy,
    } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    // Activation should pass if a blacklisted asset is not a trackedAsset
    await mockVaultProxy.getTrackedAssets.returns([randomAddress()]);
    const goodActivateForFundTx = assetBlacklist.activateForFund(
      mockComptrollerProxy,
      mockVaultProxy,
    );
    await expect(goodActivateForFundTx).resolves.toBeReceipt();

    // Setting a blacklistedAsset as a trackedAsset should make activation fail
    await mockVaultProxy.getTrackedAssets.returns([
      randomAddress(),
      blacklistedAssets[0],
    ]);
    const badActivateForFundTx = assetBlacklist.activateForFund(
      mockComptrollerProxy,
      mockVaultProxy,
    );
    await expect(badActivateForFundTx).rejects.toBeRevertedWith(
      'blacklisted asset detected',
    );
  });
});

describe('validateRule', () => {
  it('returns false if an asset is in the blacklist', async () => {
    const {
      assetBlacklist,
      blacklistedAssets,
      mockComptrollerProxy,
      mockVaultProxy,
    } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    // Only the incoming assets arg matters for this policy
    const postCoIArgs = await validateRulePostCoIArgs(
      constants.AddressZero,
      utils.randomBytes(4),
      [blacklistedAssets[0]], // bad incoming asset
      [],
      [],
      [],
    );
    const validateRuleCall = assetBlacklist.validateRule
      .args(
        mockComptrollerProxy,
        mockVaultProxy,
        policyHooks.PostCallOnIntegration,
        postCoIArgs,
      )
      .call();
    await expect(validateRuleCall).resolves.toBeFalsy();
  });

  it('returns true if an asset is not in the blacklist', async () => {
    const {
      assetBlacklist,
      mockComptrollerProxy,
      mockVaultProxy,
    } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    // Only the incoming assets arg matters for this policy
    const postCoIArgs = await validateRulePostCoIArgs(
      constants.AddressZero,
      utils.randomBytes(4),
      [randomAddress()], // good incoming asset
      [],
      [],
      [],
    );
    const validateRuleCall = assetBlacklist.validateRule
      .args(
        mockComptrollerProxy,
        mockVaultProxy,
        policyHooks.PostCallOnIntegration,
        postCoIArgs,
      )
      .call();
    await expect(validateRuleCall).resolves.toBeTruthy();
  });
});
