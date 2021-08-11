import { AddressLike, randomAddress, MockContract } from '@enzymefinance/ethers';
import {
  AllowedAdapterIncomingAssets,
  allowedAdapterIncomingAssetsArgs,
  ComptrollerLib,
  PolicyHook,
  validateRulePostCoIArgs,
  VaultLib,
} from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

async function createMocksForAllowedAdapterIncomingAssetsConfig(
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

async function deployAndConfigureStandaloneAllowedAdapterIncomingAssets(
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

  let allowedAdapterIncomingAssets = await AllowedAdapterIncomingAssets.deploy(fork.deployer, EOAPolicyManager);
  allowedAdapterIncomingAssets = allowedAdapterIncomingAssets.connect(EOAPolicyManager);

  if (assetsToAdd.length != 0) {
    const allowedAdapterIncomingAssetsConfig = allowedAdapterIncomingAssetsArgs(assetsToAdd);
    await allowedAdapterIncomingAssets.addFundSettings(comptrollerProxy, allowedAdapterIncomingAssetsConfig);
  }
  return allowedAdapterIncomingAssets;
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const allowedAdapterIncomingAssets = fork.deployment.allowedAdapterIncomingAssets;

    const getPolicyManagerCall = await allowedAdapterIncomingAssets.getPolicyManager();
    expect(getPolicyManagerCall).toMatchAddress(fork.deployment.policyManager);

    const implementedHooksCall = await allowedAdapterIncomingAssets.implementedHooks();
    expect(implementedHooksCall).toMatchFunctionOutput(allowedAdapterIncomingAssets.implementedHooks.fragment, [
      PolicyHook.PostCallOnIntegration,
    ]);
  });
});

describe('addFundSettings', () => {
  let fork: ProtocolDeployment;
  let mockComptrollerProxy: MockContract<ComptrollerLib>;
  let allowedAssets: AddressLike[];
  let allowedAdapterIncomingAssets: AllowedAdapterIncomingAssets;
  let denominationAsset: AddressLike;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    denominationAsset = randomAddress();
    allowedAssets = [denominationAsset, randomAddress(), randomAddress()];

    const mocks = await createMocksForAllowedAdapterIncomingAssetsConfig(fork, denominationAsset);
    mockComptrollerProxy = mocks.mockComptrollerProxy;

    allowedAdapterIncomingAssets = await deployAndConfigureStandaloneAllowedAdapterIncomingAssets(fork, {});
  });

  it('can only be called by the PolicyManager', async () => {
    const [randomUser] = fork.accounts;

    const allowedAdapterIncomingAssetsConfig = allowedAdapterIncomingAssetsArgs(allowedAssets);

    await expect(
      allowedAdapterIncomingAssets
        .connect(randomUser)
        .addFundSettings(mockComptrollerProxy, allowedAdapterIncomingAssetsConfig),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('sets initial config values for fund and fires events', async () => {
    const allowedAdapterIncomingAssetsConfig = allowedAdapterIncomingAssetsArgs(allowedAssets);
    const receipt = await allowedAdapterIncomingAssets.addFundSettings(
      mockComptrollerProxy,
      allowedAdapterIncomingAssetsConfig,
    );

    // Assert the AddressesAdded event was emitted
    assertEvent(receipt, 'AddressesAdded', {
      comptrollerProxy: mockComptrollerProxy,
      items: allowedAssets,
    });

    // List should be the allowed assets
    const getListCall = await allowedAdapterIncomingAssets.getList(mockComptrollerProxy);
    expect(getListCall).toMatchObject(allowedAssets);
  });
});

describe('canDisable', () => {
  it('returns false', async () => {
    const fork = await deployProtocolFixture();
    const allowedAdapterIncomingAssets = await deployAndConfigureStandaloneAllowedAdapterIncomingAssets(fork, {});

    expect(await allowedAdapterIncomingAssets.canDisable()).toBe(false);
  });
});

describe('updateFundSettings', () => {
  it('does not allow updates', async () => {
    const fork = await deployProtocolFixture();
    const allowedAdapterIncomingAssets = await deployAndConfigureStandaloneAllowedAdapterIncomingAssets(fork, {});

    await expect(allowedAdapterIncomingAssets.updateFundSettings(randomAddress(), '0x')).rejects.toBeRevertedWith(
      'Updates not allowed for this policy',
    );
  });
});

describe('validateRule', () => {
  let fork: ProtocolDeployment;
  let mockComptrollerProxy: MockContract<ComptrollerLib>;
  let allowedAssets: AddressLike[];
  let allowedAdapterIncomingAssets: AllowedAdapterIncomingAssets;
  let denominationAsset: AddressLike;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    denominationAsset = randomAddress();
    allowedAssets = [denominationAsset, randomAddress(), randomAddress()];

    const mocks = await createMocksForAllowedAdapterIncomingAssetsConfig(fork, denominationAsset);
    mockComptrollerProxy = mocks.mockComptrollerProxy;

    allowedAdapterIncomingAssets = await deployAndConfigureStandaloneAllowedAdapterIncomingAssets(fork, {
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

    const validateRuleCall = await allowedAdapterIncomingAssets.validateRule
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

    const validateRuleCall = await allowedAdapterIncomingAssets.validateRule
      .args(mockComptrollerProxy, PolicyHook.PostCallOnIntegration, postCoIArgs)
      .call();

    expect(validateRuleCall).toBe(false);
  });
});
