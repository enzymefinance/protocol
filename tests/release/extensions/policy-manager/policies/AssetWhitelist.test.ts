import { randomAddress } from '@enzymefinance/ethers';
import {
  AssetWhitelist,
  assetWhitelistArgs,
  ComptrollerLib,
  PolicyHook,
  validateRulePostCoIArgs,
  VaultLib,
} from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture } from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

async function snapshot() {
  const { deployer, accounts, deployment, config } = await deployProtocolFixture();

  const [EOAPolicyManager, ...remainingAccounts] = accounts;

  const assetWhitelist1 = await AssetWhitelist.deploy(deployer, EOAPolicyManager);
  const unconfiguredAssetWhitelist = assetWhitelist1.connect(EOAPolicyManager);

  const denominationAssetAddress = randomAddress();
  const whitelistedAssets = [denominationAssetAddress, randomAddress(), randomAddress()];

  // Mock the ComptrollerProxy and VaultProxy
  const mockVaultProxy = await VaultLib.mock(deployer);
  await mockVaultProxy.getTrackedAssets.returns([]);

  const mockComptrollerProxy = await ComptrollerLib.mock(deployer);
  await mockComptrollerProxy.getDenominationAsset.returns(denominationAssetAddress);

  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);

  const assetWhitelist2 = await AssetWhitelist.deploy(deployer, EOAPolicyManager);
  const configuredAssetWhitelist = assetWhitelist2.connect(EOAPolicyManager);
  const assetWhitelistConfig = assetWhitelistArgs(whitelistedAssets);

  await configuredAssetWhitelist.addFundSettings(mockComptrollerProxy, assetWhitelistConfig);

  return {
    deployer,
    accounts: remainingAccounts,
    config,
    configuredAssetWhitelist,
    denominationAssetAddress,
    deployment,
    mockComptrollerProxy,
    mockVaultProxy,
    unconfiguredAssetWhitelist,
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
    expect(implementedHooksCall).toMatchObject([PolicyHook.PostCallOnIntegration]);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      deployment: { assetWhitelist },
      mockComptrollerProxy,
      whitelistedAssets,
    } = await provider.snapshot(snapshot);

    const assetWhitelistConfig = assetWhitelistArgs(whitelistedAssets);

    await expect(assetWhitelist.addFundSettings(mockComptrollerProxy, assetWhitelistConfig)).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('requires that the denomination asset be whitelisted', async () => {
    const {
      unconfiguredAssetWhitelist,
      denominationAssetAddress,
      mockComptrollerProxy,
      whitelistedAssets,
    } = await provider.snapshot(snapshot);

    const assetWhitelistConfig = assetWhitelistArgs(
      whitelistedAssets.filter((asset) => asset != denominationAssetAddress),
    );

    await expect(
      unconfiguredAssetWhitelist.addFundSettings(mockComptrollerProxy, assetWhitelistConfig),
    ).rejects.toBeRevertedWith('Must whitelist denominationAsset');
  });

  it('sets initial config values for fund and fires events', async () => {
    const { unconfiguredAssetWhitelist, whitelistedAssets, mockComptrollerProxy } = await provider.snapshot(snapshot);

    const assetWhitelistConfig = assetWhitelistArgs(whitelistedAssets);
    const receipt = await unconfiguredAssetWhitelist.addFundSettings(mockComptrollerProxy, assetWhitelistConfig);

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy: mockComptrollerProxy,
      items: whitelistedAssets,
    });

    // List should be the whitelisted assets
    const getListCall = await unconfiguredAssetWhitelist.getList(mockComptrollerProxy);
    expect(getListCall).toMatchObject(whitelistedAssets);
  });
});

describe('updateFundSettings', () => {
  it('can only be called by the PolicyManager', async () => {
    const {
      deployment: { assetWhitelist },
    } = await provider.snapshot(snapshot);

    await expect(assetWhitelist.updateFundSettings(randomAddress(), randomAddress(), '0x')).rejects.toBeRevertedWith(
      'Updates not allowed for this policy',
    );
  });
});

describe('activateForFund', () => {
  it('does not allow a non-whitelisted asset in the fund trackedAssets', async () => {
    const {
      configuredAssetWhitelist,
      whitelistedAssets,
      mockComptrollerProxy,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    // Activation should pass if trackedAssets are only whitelisted assets
    await mockVaultProxy.getTrackedAssets.returns(whitelistedAssets);
    await expect(configuredAssetWhitelist.activateForFund(mockComptrollerProxy, mockVaultProxy)).resolves.toBeReceipt();

    // Setting a non-whitelisted asset as a trackedAsset should make activation fail
    await mockVaultProxy.getTrackedAssets.returns([whitelistedAssets[0], randomAddress()]);
    await expect(
      configuredAssetWhitelist.activateForFund(mockComptrollerProxy, mockVaultProxy),
    ).rejects.toBeRevertedWith('Non-whitelisted asset detected');
  });
});

describe('validateRule', () => {
  it('returns true if an asset is in the whitelist', async () => {
    const {
      configuredAssetWhitelist,
      mockComptrollerProxy,
      mockVaultProxy,
      whitelistedAssets,
    } = await provider.snapshot(snapshot);

    // Only the incoming assets arg matters for this policy
    const postCoIArgs = validateRulePostCoIArgs({
      adapter: constants.AddressZero,
      selector: utils.randomBytes(4),
      incomingAssets: [whitelistedAssets[0]], // good incoming asset
      incomingAssetAmounts: [],
      outgoingAssets: [],
      outgoingAssetAmounts: [],
    });

    const validateRuleCall = await configuredAssetWhitelist.validateRule
      .args(mockComptrollerProxy, mockVaultProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
      .call();

    expect(validateRuleCall).toBe(true);
  });

  it('returns false if an asset is not in the whitelist', async () => {
    const { configuredAssetWhitelist, mockComptrollerProxy, mockVaultProxy } = await provider.snapshot(snapshot);

    // Only the incoming assets arg matters for this policy
    const postCoIArgs = validateRulePostCoIArgs({
      adapter: constants.AddressZero,
      selector: utils.randomBytes(4),
      incomingAssets: [randomAddress()], // good incoming asset
      incomingAssetAmounts: [],
      outgoingAssets: [],
      outgoingAssetAmounts: [],
    });

    const validateRuleCall = await configuredAssetWhitelist.validateRule
      .args(mockComptrollerProxy, mockVaultProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
      .call();

    expect(validateRuleCall).toBe(false);
  });
});
