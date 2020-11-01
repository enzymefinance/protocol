import { constants, utils } from 'ethers';
import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import {
  AssetWhitelist,
  assetWhitelistArgs,
  ComptrollerLib,
  PolicyHook,
  validateRulePostCoIArgs,
  VaultLib,
} from '@melonproject/protocol';
import { defaultTestDeployment, assertEvent } from '@melonproject/testutils';

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
  const assetWhitelist = await AssetWhitelist.deploy(
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
    assetWhitelist,
    denominationAssetAddress,
    EOAPolicyManager,
    mockComptrollerProxy,
    mockVaultProxy,
    whitelistedAssets: [
      denominationAssetAddress,
      randomAddress(),
      randomAddress(),
    ],
  };
}

async function snapshotWithConfiguredStandalonePolicy(
  provider: EthereumTestnetProvider,
) {
  const {
    accounts,
    assetWhitelist,
    EOAPolicyManager,
    mockComptrollerProxy,
    mockVaultProxy,
    whitelistedAssets,
  } = await provider.snapshot(snapshotWithStandalonePolicy);

  const permissionedAssetWhitelist = assetWhitelist.connect(EOAPolicyManager);
  const assetWhitelistConfig = assetWhitelistArgs(whitelistedAssets);
  await permissionedAssetWhitelist.addFundSettings(
    mockComptrollerProxy,
    assetWhitelistConfig,
  );

  return {
    accounts,
    assetWhitelist: permissionedAssetWhitelist,
    EOAPolicyManager,
    mockComptrollerProxy,
    mockVaultProxy,
    whitelistedAssets,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { policyManager, assetWhitelist },
    } = await provider.snapshot(snapshot);

    const getPolicyManagerCall = await assetWhitelist.getPolicyManager();
    expect(getPolicyManagerCall).toMatchAddress(policyManager);

    const implementedHooksCall = await assetWhitelist.implementedHooks();
    expect(implementedHooksCall).toMatchObject([
      PolicyHook.PostCallOnIntegration,
    ]);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      assetWhitelist,
      mockComptrollerProxy,
      whitelistedAssets,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const assetWhitelistConfig = assetWhitelistArgs(whitelistedAssets);

    await expect(
      assetWhitelist.addFundSettings(
        mockComptrollerProxy,
        assetWhitelistConfig,
      ),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('requires that the denomination asset be whitelisted', async () => {
    const {
      assetWhitelist,
      denominationAssetAddress,
      EOAPolicyManager,
      mockComptrollerProxy,
      whitelistedAssets,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const assetWhitelistConfig = assetWhitelistArgs(
      whitelistedAssets.filter((asset) => asset != denominationAssetAddress),
    );

    await expect(
      assetWhitelist
        .connect(EOAPolicyManager)
        .addFundSettings(mockComptrollerProxy, assetWhitelistConfig),
    ).rejects.toBeRevertedWith('must whitelist denominationAsset');
  });

  it('sets initial config values for fund and fires events', async () => {
    const {
      assetWhitelist,
      whitelistedAssets,
      mockComptrollerProxy,
      EOAPolicyManager,
    } = await provider.snapshot(snapshotWithStandalonePolicy);

    const assetWhitelistConfig = assetWhitelistArgs(whitelistedAssets);
    const receipt = await assetWhitelist
      .connect(EOAPolicyManager)
      .addFundSettings(mockComptrollerProxy, assetWhitelistConfig);

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy: mockComptrollerProxy,
      items: whitelistedAssets,
    });

    // List should be the whitelisted assets
    const getListCall = await assetWhitelist.getList(mockComptrollerProxy);
    expect(getListCall).toMatchObject(whitelistedAssets);
  });
});

describe('updateFundSettings', () => {
  it('cannot be called', async () => {
    const { assetWhitelist } = await provider.snapshot(
      snapshotWithStandalonePolicy,
    );

    await expect(
      assetWhitelist.updateFundSettings(randomAddress(), randomAddress(), '0x'),
    ).rejects.toBeRevertedWith('Updates not allowed for this policy');
  });
});

describe('activateForFund', () => {
  it('does not allow a non-whitelisted asset in the fund trackedAssets', async () => {
    const {
      assetWhitelist,
      whitelistedAssets,
      mockComptrollerProxy,
      mockVaultProxy,
    } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    // Activation should pass if trackedAssets are only whitelisted assets
    await mockVaultProxy.getTrackedAssets.returns(whitelistedAssets);
    await expect(
      assetWhitelist.activateForFund(mockComptrollerProxy, mockVaultProxy),
    ).resolves.toBeReceipt();

    // Setting a non-whitelisted asset as a trackedAsset should make activation fail
    await mockVaultProxy.getTrackedAssets.returns([
      whitelistedAssets[0],
      randomAddress(),
    ]);
    await expect(
      assetWhitelist.activateForFund(mockComptrollerProxy, mockVaultProxy),
    ).rejects.toBeRevertedWith('non-whitelisted asset detected');
  });
});

describe('validateRule', () => {
  it('returns true if an asset is in the whitelist', async () => {
    const {
      assetWhitelist,
      mockComptrollerProxy,
      mockVaultProxy,
      whitelistedAssets,
    } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    // Only the incoming assets arg matters for this policy
    const postCoIArgs = validateRulePostCoIArgs({
      adapter: constants.AddressZero,
      selector: utils.randomBytes(4),
      incomingAssets: [whitelistedAssets[0]], // good incoming asset
      incomingAssetAmounts: [],
      outgoingAssets: [],
      outgoingAssetAmounts: [],
    });

    const validateRuleCall = await assetWhitelist.validateRule
      .args(
        mockComptrollerProxy,
        mockVaultProxy,
        PolicyHook.PostCallOnIntegration,
        postCoIArgs,
      )
      .call();

    expect(validateRuleCall).toBeTruthy();
  });

  it('returns false if an asset is not in the whitelist', async () => {
    const {
      assetWhitelist,
      mockComptrollerProxy,
      mockVaultProxy,
    } = await provider.snapshot(snapshotWithConfiguredStandalonePolicy);

    // Only the incoming assets arg matters for this policy
    const postCoIArgs = validateRulePostCoIArgs({
      adapter: constants.AddressZero,
      selector: utils.randomBytes(4),
      incomingAssets: [randomAddress()], // good incoming asset
      incomingAssetAmounts: [],
      outgoingAssets: [],
      outgoingAssetAmounts: [],
    });

    const validateRuleCall = await assetWhitelist.validateRule
      .args(
        mockComptrollerProxy,
        mockVaultProxy,
        PolicyHook.PostCallOnIntegration,
        postCoIArgs,
      )
      .call();

    expect(validateRuleCall).toBeFalsy();
  });
});
