import { AddressLike, randomAddress, MockContract } from '@enzymefinance/ethers';
import {
  AllowedAdapterIncomingAssetsPolicy,
  allowedAdapterIncomingAssetsPolicyArgs,
  ComptrollerLib,
  PolicyHook,
  validateRulePostCoIArgs,
  VaultLib,
} from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

async function createMocksForAllowedAdapterIncomingAssetsPolicyConfig(
  fork: ProtocolDeployment,
  denominationAsset: AddressLike,
) {
  const mockVaultProxy = await VaultLib.mock(fork.deployer);
  await mockVaultProxy.getTrackedAssets.returns([]);

  const mockComptrollerProxy = await ComptrollerLib.mock(fork.deployer);
  await mockComptrollerProxy.getDenominationAsset.returns(denominationAsset);

  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);

  return { mockComptrollerProxy, mockVaultProxy };
}

async function deployAndConfigureStandaloneAllowedAdapterIncomingAssetsPolicy(
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

  let allowedAdapterIncomingAssetsPolicy = await AllowedAdapterIncomingAssetsPolicy.deploy(
    fork.deployer,
    EOAPolicyManager,
  );
  allowedAdapterIncomingAssetsPolicy = allowedAdapterIncomingAssetsPolicy.connect(EOAPolicyManager);

  if (assetsToAdd.length != 0) {
    const allowedAdapterIncomingAssetsPolicyConfig = allowedAdapterIncomingAssetsPolicyArgs(assetsToAdd);
    await allowedAdapterIncomingAssetsPolicy.addFundSettings(
      comptrollerProxy,
      allowedAdapterIncomingAssetsPolicyConfig,
    );
  }
  return allowedAdapterIncomingAssetsPolicy;
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const allowedAdapterIncomingAssetsPolicy = fork.deployment.allowedAdapterIncomingAssetsPolicy;

    const getPolicyManagerCall = await allowedAdapterIncomingAssetsPolicy.getPolicyManager();
    expect(getPolicyManagerCall).toMatchAddress(fork.deployment.policyManager);

    const implementedHooksCall = await allowedAdapterIncomingAssetsPolicy.implementedHooks();
    expect(implementedHooksCall).toMatchFunctionOutput(allowedAdapterIncomingAssetsPolicy.implementedHooks.fragment, [
      PolicyHook.PostCallOnIntegration,
    ]);
  });
});

describe('addFundSettings', () => {
  let fork: ProtocolDeployment;
  let mockComptrollerProxy: MockContract<ComptrollerLib>;
  let allowedAssets: AddressLike[];
  let allowedAdapterIncomingAssetsPolicy: AllowedAdapterIncomingAssetsPolicy;
  let denominationAsset: AddressLike;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    denominationAsset = randomAddress();
    allowedAssets = [denominationAsset, randomAddress(), randomAddress()];

    const mocks = await createMocksForAllowedAdapterIncomingAssetsPolicyConfig(fork, denominationAsset);
    mockComptrollerProxy = mocks.mockComptrollerProxy;

    allowedAdapterIncomingAssetsPolicy = await deployAndConfigureStandaloneAllowedAdapterIncomingAssetsPolicy(fork, {});
  });

  it('can only be called by the PolicyManager', async () => {
    const [randomUser] = fork.accounts;

    const allowedAdapterIncomingAssetsPolicyConfig = allowedAdapterIncomingAssetsPolicyArgs(allowedAssets);

    await expect(
      allowedAdapterIncomingAssetsPolicy
        .connect(randomUser)
        .addFundSettings(mockComptrollerProxy, allowedAdapterIncomingAssetsPolicyConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('sets initial config values for fund and fires events', async () => {
    const allowedAdapterIncomingAssetsPolicyConfig = allowedAdapterIncomingAssetsPolicyArgs(allowedAssets);
    const receipt = await allowedAdapterIncomingAssetsPolicy.addFundSettings(
      mockComptrollerProxy,
      allowedAdapterIncomingAssetsPolicyConfig,
    );

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy: mockComptrollerProxy,
      items: allowedAssets,
    });

    // List should be the allowed assets
    const getListCall = await allowedAdapterIncomingAssetsPolicy.getList(mockComptrollerProxy);
    expect(getListCall).toMatchObject(allowedAssets);
  });
});

describe('canDisable', () => {
  it('returns false', async () => {
    const fork = await deployProtocolFixture();
    const allowedAdapterIncomingAssetsPolicy = await deployAndConfigureStandaloneAllowedAdapterIncomingAssetsPolicy(
      fork,
      {},
    );

    expect(await allowedAdapterIncomingAssetsPolicy.canDisable()).toBe(false);
  });
});

describe('updateFundSettings', () => {
  it('does not allow updates', async () => {
    const fork = await deployProtocolFixture();
    const allowedAdapterIncomingAssetsPolicy = await deployAndConfigureStandaloneAllowedAdapterIncomingAssetsPolicy(
      fork,
      {},
    );

    await expect(allowedAdapterIncomingAssetsPolicy.updateFundSettings(randomAddress(), '0x')).rejects.toBeRevertedWith(
      'Updates not allowed for this policy',
    );
  });
});

describe('validateRule', () => {
  let fork: ProtocolDeployment;
  let mockComptrollerProxy: MockContract<ComptrollerLib>;
  let allowedAssets: AddressLike[];
  let allowedAdapterIncomingAssetsPolicy: AllowedAdapterIncomingAssetsPolicy;
  let denominationAsset: AddressLike;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    denominationAsset = randomAddress();
    allowedAssets = [denominationAsset, randomAddress(), randomAddress()];

    const mocks = await createMocksForAllowedAdapterIncomingAssetsPolicyConfig(fork, denominationAsset);
    mockComptrollerProxy = mocks.mockComptrollerProxy;

    allowedAdapterIncomingAssetsPolicy = await deployAndConfigureStandaloneAllowedAdapterIncomingAssetsPolicy(fork, {
      comptrollerProxy: mockComptrollerProxy,
      assetsToAdd: allowedAssets,
    });
  });

  it('returns true if an asset is allowed', async () => {
    // Only the incoming assets arg matters for this policy
    const postCoIArgs = validateRulePostCoIArgs({
      caller: randomAddress(),
      adapter: constants.AddressZero,
      selector: utils.randomBytes(4),
      incomingAssets: [allowedAssets[0]], // good incoming asset
      incomingAssetAmounts: [],
      spendAssets: [],
      spendAssetAmounts: [],
    });

    const validateRuleCall = await allowedAdapterIncomingAssetsPolicy.validateRule
      .args(mockComptrollerProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
      .call();

    expect(validateRuleCall).toBe(true);
  });

  it('returns false if an asset is not allowed', async () => {
    // Only the incoming assets arg matters for this policy
    const postCoIArgs = validateRulePostCoIArgs({
      caller: randomAddress(),
      adapter: constants.AddressZero,
      selector: utils.randomBytes(4),
      incomingAssets: [randomAddress()], // good incoming asset
      incomingAssetAmounts: [],
      spendAssets: [],
      spendAssetAmounts: [],
    });

    const validateRuleCall = await allowedAdapterIncomingAssetsPolicy.validateRule
      .args(mockComptrollerProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
      .call();

    expect(validateRuleCall).toBe(false);
  });
});
