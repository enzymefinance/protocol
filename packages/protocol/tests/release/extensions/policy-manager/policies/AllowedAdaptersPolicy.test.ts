import { randomAddress } from '@enzymefinance/ethers';
import type { AllowedAdaptersPolicy, ComptrollerLib, IntegrationManager, VaultLib } from '@enzymefinance/protocol';
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
import { createNewFund, deployProtocolFixture, mockGenericSwap } from '@enzymefinance/testutils';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const allowedAdaptersPolicy = fork.deployment.allowedAdaptersPolicy;

    expect(await allowedAdaptersPolicy.getPolicyManager()).toMatchAddress(fork.deployment.policyManager);

    // AddressListRegistryPolicyBase
    expect(await allowedAdaptersPolicy.getAddressListRegistry()).toMatchAddress(fork.deployment.addressListRegistry);
  });
});

describe('canDisable', () => {
  it('returns false', async () => {
    expect(await fork.deployment.allowedAdaptersPolicy.canDisable()).toBe(false);
  });
});

describe('implementsHooks', () => {
  it('returns only the correct hook', async () => {
    const allowedAdaptersPolicy = fork.deployment.allowedAdaptersPolicy;

    expect(await allowedAdaptersPolicy.implementedHooks()).toMatchFunctionOutput(
      allowedAdaptersPolicy.implementedHooks.fragment,
      [PolicyHook.PostCallOnIntegration],
    );
  });
});

describe('updateFundSettings', () => {
  it('does not allow updates', async () => {
    await expect(
      fork.deployment.allowedAdaptersPolicy.updateFundSettings(randomAddress(), '0x'),
    ).rejects.toBeRevertedWith('Updates not allowed for this policy');
  });
});

// List search condition: The item must be in at least one list
describe('validateRule', () => {
  let fundOwner: SignerWithAddress;
  let allowedAdaptersPolicy: AllowedAdaptersPolicy, integrationManager: IntegrationManager;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let mockGenericIntegratee: MockGenericIntegratee,
    allowedMockGenericAdapter: MockGenericAdapter,
    unallowedMockGenericAdapter: MockGenericAdapter;

  beforeEach(async () => {
    [fundOwner] = fork.accounts;
    allowedAdaptersPolicy = fork.deployment.allowedAdaptersPolicy;
    integrationManager = fork.deployment.integrationManager;

    mockGenericIntegratee = await MockGenericIntegratee.deploy(fork.deployer);
    allowedMockGenericAdapter = await MockGenericAdapter.deploy(fork.deployer, mockGenericIntegratee);
    unallowedMockGenericAdapter = await MockGenericAdapter.deploy(fork.deployer, mockGenericIntegratee);

    const newFundRes = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedAdaptersPolicy],
        settings: [
          addressListRegistryPolicyArgs({
            existingListIds: [0], // Include empty list to test inclusion in 1 list only
            newListsArgs: [
              {
                initialItems: [allowedMockGenericAdapter],
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

  it('does not allow an unlisted adapter', async () => {
    await expect(
      mockGenericSwap({
        provider,
        comptrollerProxy,
        signer: fundOwner,
        integrationManager,
        mockGenericAdapter: unallowedMockGenericAdapter,
        vaultProxy,
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: ALLOWED_ADAPTERS');
  });

  it('allows listed assets', async () => {
    await mockGenericSwap({
      provider,
      comptrollerProxy,
      signer: fundOwner,
      integrationManager,
      mockGenericAdapter: allowedMockGenericAdapter,
      vaultProxy,
    });
  });
});
