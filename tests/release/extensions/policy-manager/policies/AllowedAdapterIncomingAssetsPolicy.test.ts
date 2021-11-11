import { randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  AllowedAdapterIncomingAssetsPolicy,
  ComptrollerLib,
  IntegrationManager,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  addressListRegistryPolicyArgs,
  AddressListUpdateType,
  MockGenericAdapter,
  MockGenericIntegratee,
  PolicyHook,
  policyManagerConfigArgs,
  StandardToken,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { createNewFund, deployProtocolFixture, mockGenericSwap } from '@enzymefinance/testutils';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const allowedAdapterIncomingAssetsPolicy = fork.deployment.allowedAdapterIncomingAssetsPolicy;

    expect(await allowedAdapterIncomingAssetsPolicy.getPolicyManager()).toMatchAddress(fork.deployment.policyManager);

    // AddressListRegistryPolicyBase
    expect(await allowedAdapterIncomingAssetsPolicy.getAddressListRegistry()).toMatchAddress(
      fork.deployment.addressListRegistry,
    );
  });
});

describe('canDisable', () => {
  it('returns false', async () => {
    expect(await fork.deployment.allowedAdapterIncomingAssetsPolicy.canDisable()).toBe(false);
  });
});

describe('implementsHooks', () => {
  it('returns only the correct hook', async () => {
    const allowedAdapterIncomingAssetsPolicy = fork.deployment.allowedAdapterIncomingAssetsPolicy;

    expect(await allowedAdapterIncomingAssetsPolicy.implementedHooks()).toMatchFunctionOutput(
      allowedAdapterIncomingAssetsPolicy.implementedHooks.fragment,
      [PolicyHook.PostCallOnIntegration],
    );
  });
});

describe('updateFundSettings', () => {
  it('does not allow updates', async () => {
    await expect(
      fork.deployment.allowedAdapterIncomingAssetsPolicy.updateFundSettings(randomAddress(), '0x'),
    ).rejects.toBeRevertedWith('Updates not allowed for this policy');
  });
});

// List search condition: All items must be in at least one list
describe('validateRule', () => {
  let fundOwner: SignerWithAddress;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let mockGenericAdapter: MockGenericAdapter, mockGenericIntegratee: MockGenericIntegratee;
  let allowedAdapterIncomingAssetsPolicy: AllowedAdapterIncomingAssetsPolicy, integrationManager: IntegrationManager;
  let allowedAsset1: StandardToken, allowedAsset2: StandardToken, notAllowedAsset: StandardToken;

  beforeEach(async () => {
    [fundOwner] = fork.accounts;
    allowedAdapterIncomingAssetsPolicy = fork.deployment.allowedAdapterIncomingAssetsPolicy;
    integrationManager = fork.deployment.integrationManager;

    mockGenericIntegratee = await MockGenericIntegratee.deploy(fork.deployer);
    mockGenericAdapter = await MockGenericAdapter.deploy(fork.deployer, mockGenericIntegratee);

    const denominationAsset = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    allowedAsset1 = denominationAsset;
    allowedAsset2 = new StandardToken(fork.config.primitives.mln, whales.mln);
    notAllowedAsset = new StandardToken(fork.config.primitives.dai, whales.dai);

    const newFundRes = await createNewFund({
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedAdapterIncomingAssetsPolicy],
        settings: [
          addressListRegistryPolicyArgs({
            existingListIds: [0], // Include empty list to test inclusion in 1 list only
            newListsArgs: [
              {
                initialItems: [allowedAsset1, allowedAsset2],
                updateType: AddressListUpdateType.None,
              },
            ],
          }),
        ],
      }),
      signer: fundOwner,
    });
    comptrollerProxy = newFundRes.comptrollerProxy;
    vaultProxy = newFundRes.vaultProxy;
  });

  it('does not allow an unlisted asset', async () => {
    const incomingAssetAmount = 123;
    await allowedAsset1.transfer(mockGenericIntegratee, incomingAssetAmount);
    await allowedAsset2.transfer(mockGenericIntegratee, incomingAssetAmount);
    await notAllowedAsset.transfer(mockGenericIntegratee, incomingAssetAmount);

    await expect(
      mockGenericSwap({
        actualIncomingAssetAmounts: [incomingAssetAmount, incomingAssetAmount, incomingAssetAmount],
        comptrollerProxy,
        fundOwner,
        incomingAssets: [allowedAsset1, allowedAsset2, notAllowedAsset],
        integrationManager,
        mockGenericAdapter,
        vaultProxy,
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: ALLOWED_ADAPTER_INCOMING_ASSETS');
  });

  it('allows listed assets', async () => {
    const incomingAssetAmount = 123;
    await allowedAsset1.transfer(mockGenericIntegratee, incomingAssetAmount);
    await allowedAsset2.transfer(mockGenericIntegratee, incomingAssetAmount);

    await mockGenericSwap({
      actualIncomingAssetAmounts: [incomingAssetAmount, incomingAssetAmount],
      comptrollerProxy,
      fundOwner,
      incomingAssets: [allowedAsset1, allowedAsset2],
      integrationManager,
      mockGenericAdapter,
      vaultProxy,
    });
  });
});
