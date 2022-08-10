import { randomAddress } from '@enzymefinance/ethers';
import type {
  AllowedAdapterIncomingAssetsPolicy,
  ComptrollerLib,
  IntegrationManager,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  addressListRegistryPolicyArgs,
  AddressListUpdateType,
  ITestStandardToken,
  MockGenericAdapter,
  MockGenericIntegratee,
  PolicyHook,
  policyManagerConfigArgs,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import { createNewFund, deployProtocolFixture, mockGenericSwap, setAccountBalance } from '@enzymefinance/testutils';

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
  let allowedAsset1: ITestStandardToken, allowedAsset2: ITestStandardToken, notAllowedAsset: ITestStandardToken;

  beforeEach(async () => {
    [fundOwner] = fork.accounts;
    allowedAdapterIncomingAssetsPolicy = fork.deployment.allowedAdapterIncomingAssetsPolicy;
    integrationManager = fork.deployment.integrationManager;

    mockGenericIntegratee = await MockGenericIntegratee.deploy(fork.deployer);
    mockGenericAdapter = await MockGenericAdapter.deploy(fork.deployer, mockGenericIntegratee);

    const denominationAsset = new ITestStandardToken(fork.config.primitives.usdc, provider);

    allowedAsset1 = denominationAsset;
    allowedAsset2 = new ITestStandardToken(fork.config.primitives.mln, provider);
    notAllowedAsset = new ITestStandardToken(fork.config.primitives.dai, provider);

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

    await setAccountBalance({
      account: mockGenericIntegratee,
      amount: incomingAssetAmount,
      provider,
      token: allowedAsset1,
    });
    await setAccountBalance({
      account: mockGenericIntegratee,
      amount: incomingAssetAmount,
      provider,
      token: allowedAsset2,
    });
    await setAccountBalance({
      account: mockGenericIntegratee,
      amount: incomingAssetAmount,
      provider,
      token: notAllowedAsset,
    });

    await expect(
      mockGenericSwap({
        provider,
        actualIncomingAssetAmounts: [incomingAssetAmount, incomingAssetAmount, incomingAssetAmount],
        comptrollerProxy,
        signer: fundOwner,
        incomingAssets: [allowedAsset1, allowedAsset2, notAllowedAsset],
        integrationManager,
        mockGenericAdapter,
        vaultProxy,
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: ALLOWED_ADAPTER_INCOMING_ASSETS');
  });

  it('allows listed assets', async () => {
    const incomingAssetAmount = 123;

    await setAccountBalance({
      account: mockGenericIntegratee,
      amount: incomingAssetAmount,
      provider,
      token: allowedAsset1,
    });
    await setAccountBalance({
      account: mockGenericIntegratee,
      amount: incomingAssetAmount,
      provider,
      token: allowedAsset2,
    });

    await mockGenericSwap({
      provider,
      actualIncomingAssetAmounts: [incomingAssetAmount, incomingAssetAmount],
      comptrollerProxy,
      signer: fundOwner,
      incomingAssets: [allowedAsset1, allowedAsset2],
      integrationManager,
      mockGenericAdapter,
      vaultProxy,
    });
  });
});
