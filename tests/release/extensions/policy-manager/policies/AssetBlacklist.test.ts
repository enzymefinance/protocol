import { constants, utils } from 'ethers';
import { EthereumTestnetProvider, randomAddress } from '@crestproject/crestproject';
import {
  AssetBlacklist,
  assetBlacklistArgs,
  ComptrollerLib,
  PolicyHook,
  validateRulePostCoIArgs,
  VaultLib,
} from '@melonproject/protocol';
import { defaultTestDeployment, assertEvent } from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(provider);

  return {
    accounts,
    deployment,
    config,
  };
}

async function snapshotWithStandalonePolicy(provider: EthereumTestnetProvider) {
  const {
    accounts: [EOAPolicyManager, ...remainingAccounts],
    config,
  } = await provider.snapshot(snapshot);

  const assetBlacklist = await AssetBlacklist.deploy(config.deployer, EOAPolicyManager);

  const denominationAssetAddress = randomAddress();

  // Mock the ComptrollerProxy and VaultProxy
  const mockVaultProxy = await VaultLib.mock(config.deployer);
  await mockVaultProxy.getTrackedAssets.returns([]);

  const mockComptrollerProxy = await ComptrollerLib.mock(config.deployer);
  await mockComptrollerProxy.getDenominationAsset.returns(denominationAssetAddress);

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

async function snapshotWithConfiguredStandalonePolicy(provider: EthereumTestnetProvider) {
  const {
    accounts,
    assetBlacklist,
    blacklistedAssets,
    EOAPolicyManager,
    mockComptrollerProxy,
    mockVaultProxy,
  } = await provider.snapshot(snapshotWithStandalonePolicy);

  const permissionedAssetBlacklist = assetBlacklist.connect(EOAPolicyManager);
  const assetBlacklistConfig = assetBlacklistArgs(blacklistedAssets);
  await permissionedAssetBlacklist.addFundSettings(mockComptrollerProxy, assetBlacklistConfig);

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

    const policyManagerResult = await assetBlacklist.getPolicyManager();
    expect(policyManagerResult).toMatchAddress(policyManager);

    const implementedHooksResult = await assetBlacklist.implementedHooks();
    expect(implementedHooksResult).toMatchObject([PolicyHook.PostCallOnIntegration]);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const { assetBlacklist, blacklistedAssets, mockComptrollerProxy } = await provider.snapshot(
      snapshotWithStandalonePolicy,
    );

    const assetBlacklistConfig = assetBlacklistArgs(blacklistedAssets);

    await expect(assetBlacklist.addFundSettings(mockComptrollerProxy, assetBlacklistConfig)).rejects.toBeRevertedWith(
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

    const assetBlacklistConfig = assetBlacklistArgs([...blacklistedAssets, denominationAssetAddress]);

    await expect(
      assetBlacklist.connect(EOAPolicyManager).addFundSettings(mockComptrollerProxy, assetBlacklistConfig),
    ).rejects.toBeRevertedWith('Cannot blacklist denominationAsset');
  });

  it('sets initial config values for fund and fires events', async () => {
    const { assetBlacklist, blacklistedAssets, mockComptrollerProxy, EOAPolicyManager } = await provider.snapshot(
      snapshotWithStandalonePolicy,
    );

    const assetBlacklistConfig = assetBlacklistArgs(blacklistedAssets);
    const receipt = await assetBlacklist
      .connect(EOAPolicyManager)
      .addFundSettings(mockComptrollerProxy, assetBlacklistConfig);

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy: mockComptrollerProxy,
      items: blacklistedAssets,
    });

    // List should be the blacklisted assets
    const getListCall = await assetBlacklist.getList(mockComptrollerProxy);
    expect(getListCall).toMatchObject(blacklistedAssets);
  });
});

describe('updateFundSettings', () => {
  it('cannot be called', async () => {
    const { assetBlacklist } = await provider.snapshot(snapshotWithStandalonePolicy);

    await expect(assetBlacklist.updateFundSettings(randomAddress(), randomAddress(), '0x')).rejects.toBeRevertedWith(
      'Updates not allowed for this policy',
    );
  });
});

describe('activateForFund', () => {
  it('does not allow a blacklisted asset in the fund trackedAssets', async () => {
    const { assetBlacklist, blacklistedAssets, mockComptrollerProxy, mockVaultProxy } = await provider.snapshot(
      snapshotWithConfiguredStandalonePolicy,
    );

    // Activation should pass if a blacklisted asset is not a trackedAsset
    await mockVaultProxy.getTrackedAssets.returns([randomAddress()]);

    await expect(assetBlacklist.activateForFund(mockComptrollerProxy, mockVaultProxy)).resolves.toBeReceipt();

    // Setting a blacklistedAsset as a trackedAsset should make activation fail
    await mockVaultProxy.getTrackedAssets.returns([randomAddress(), blacklistedAssets[0]]);

    await expect(assetBlacklist.activateForFund(mockComptrollerProxy, mockVaultProxy)).rejects.toBeRevertedWith(
      'Blacklisted asset detected',
    );
  });
});

describe('validateRule', () => {
  it('returns false if an asset is in the blacklist', async () => {
    const { assetBlacklist, blacklistedAssets, mockComptrollerProxy, mockVaultProxy } = await provider.snapshot(
      snapshotWithConfiguredStandalonePolicy,
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
    const { assetBlacklist, mockComptrollerProxy, mockVaultProxy } = await provider.snapshot(
      snapshotWithConfiguredStandalonePolicy,
    );

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
  it.todo('can create a new fund with this policy, and it works correctly during callOnIntegration');

  it.todo('can create a migrated fund with this policy');
});
