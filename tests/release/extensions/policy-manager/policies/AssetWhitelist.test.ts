import { AddressLike, randomAddress, MockContract } from '@enzymefinance/ethers';
import {
  AssetWhitelist,
  assetWhitelistArgs,
  ComptrollerLib,
  PolicyHook,
  validateRulePostCoIArgs,
  VaultLib,
} from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

async function createMocksForAssetWhitelistConfig(fork: ProtocolDeployment, denominationAsset: AddressLike) {
  const mockVaultProxy = await VaultLib.mock(fork.deployer);
  await mockVaultProxy.getTrackedAssets.returns([]);

  const mockComptrollerProxy = await ComptrollerLib.mock(fork.deployer);
  await mockComptrollerProxy.getDenominationAsset.returns(denominationAsset);

  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);

  return { mockComptrollerProxy, mockVaultProxy };
}

async function deployAndConfigureStandaloneAssetWhitelist(
  fork: ProtocolDeployment,
  {
    comptrollerProxy = '0x',
    assetsToAdd = [],
  }: {
    comptrollerProxy?: AddressLike;
    assetsToAdd?: AddressLike[];
  },
) {
  const [EOAPolicyManager] = fork.accounts.slice(-1);

  let assetWhitelist = await AssetWhitelist.deploy(fork.deployer, EOAPolicyManager);
  assetWhitelist = assetWhitelist.connect(EOAPolicyManager);

  if (assetsToAdd.length != 0) {
    const assetWhitelistConfig = assetWhitelistArgs(assetsToAdd);
    await assetWhitelist.addFundSettings(comptrollerProxy, assetWhitelistConfig);
  }
  return assetWhitelist;
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const assetWhitelist = fork.deployment.assetWhitelist;

    const getPolicyManagerCall = await assetWhitelist.getPolicyManager();
    expect(getPolicyManagerCall).toMatchAddress(fork.deployment.policyManager);

    const implementedHooksCall = await assetWhitelist.implementedHooks();
    expect(implementedHooksCall).toMatchObject([PolicyHook.PostCallOnIntegration]);
  });
});

describe('addFundSettings', () => {
  let fork: ProtocolDeployment;
  let mockComptrollerProxy: MockContract<ComptrollerLib>;
  let whitelistedAssets: AddressLike[];
  let assetWhitelist: AssetWhitelist;
  let denominationAsset: AddressLike;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    denominationAsset = randomAddress();
    whitelistedAssets = [denominationAsset, randomAddress(), randomAddress()];

    const mocks = await createMocksForAssetWhitelistConfig(fork, denominationAsset);
    mockComptrollerProxy = mocks.mockComptrollerProxy;

    assetWhitelist = await deployAndConfigureStandaloneAssetWhitelist(fork, {});
  });

  it('can only be called by the PolicyManager', async () => {
    const [randomUser] = fork.accounts;

    const assetWhitelistConfig = assetWhitelistArgs(whitelistedAssets);

    await expect(
      assetWhitelist.connect(randomUser).addFundSettings(mockComptrollerProxy, assetWhitelistConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('requires that the denomination asset be whitelisted', async () => {
    const assetWhitelistConfig = assetWhitelistArgs(whitelistedAssets.filter((asset) => asset != denominationAsset));

    await expect(assetWhitelist.addFundSettings(mockComptrollerProxy, assetWhitelistConfig)).rejects.toBeRevertedWith(
      'Must whitelist denominationAsset',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const assetWhitelistConfig = assetWhitelistArgs(whitelistedAssets);
    const receipt = await assetWhitelist.addFundSettings(mockComptrollerProxy, assetWhitelistConfig);

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
  it('can only be called by the PolicyManager', async () => {
    const fork = await deployProtocolFixture();
    const assetWhitelist = await deployAndConfigureStandaloneAssetWhitelist(fork, {});

    await expect(assetWhitelist.updateFundSettings(randomAddress(), randomAddress(), '0x')).rejects.toBeRevertedWith(
      'Updates not allowed for this policy',
    );
  });
});

describe('activateForFund', () => {
  it('does not allow a non-whitelisted asset in the fund trackedAssets', async () => {
    const fork = await deployProtocolFixture();
    const denominationAsset = randomAddress();
    const whitelistedAssets = [denominationAsset, randomAddress(), randomAddress()];

    const mocks = await createMocksForAssetWhitelistConfig(fork, denominationAsset);
    const mockComptrollerProxy = mocks.mockComptrollerProxy;
    const mockVaultProxy = mocks.mockVaultProxy;

    const assetWhitelist = await deployAndConfigureStandaloneAssetWhitelist(fork, {
      comptrollerProxy: mockComptrollerProxy,
      assetsToAdd: whitelistedAssets,
    });

    // Activation should pass if trackedAssets are only whitelisted assets
    await mockVaultProxy.getTrackedAssets.returns(whitelistedAssets);
    await expect(assetWhitelist.activateForFund(mockComptrollerProxy, mockVaultProxy)).resolves.toBeReceipt();

    // Setting a non-whitelisted asset as a trackedAsset should make activation fail
    await mockVaultProxy.getTrackedAssets.returns([whitelistedAssets[0], randomAddress()]);
    await expect(assetWhitelist.activateForFund(mockComptrollerProxy, mockVaultProxy)).rejects.toBeRevertedWith(
      'Non-whitelisted asset detected',
    );
  });
});

describe('validateRule', () => {
  let fork: ProtocolDeployment;
  let mockComptrollerProxy: MockContract<ComptrollerLib>;
  let mockVaultProxy: MockContract<VaultLib>;
  let whitelistedAssets: AddressLike[];
  let assetWhitelist: AssetWhitelist;
  let denominationAsset: AddressLike;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    denominationAsset = randomAddress();
    whitelistedAssets = [denominationAsset, randomAddress(), randomAddress()];

    const mocks = await createMocksForAssetWhitelistConfig(fork, denominationAsset);
    mockComptrollerProxy = mocks.mockComptrollerProxy;
    mockVaultProxy = mocks.mockVaultProxy;

    assetWhitelist = await deployAndConfigureStandaloneAssetWhitelist(fork, {
      comptrollerProxy: mockComptrollerProxy,
      assetsToAdd: whitelistedAssets,
    });
  });

  it('returns true if an asset is in the whitelist', async () => {
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
      .args(mockComptrollerProxy, mockVaultProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
      .call();

    expect(validateRuleCall).toBe(true);
  });

  it('returns false if an asset is not in the whitelist', async () => {
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
      .args(mockComptrollerProxy, mockVaultProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
      .call();

    expect(validateRuleCall).toBe(false);
  });
});
