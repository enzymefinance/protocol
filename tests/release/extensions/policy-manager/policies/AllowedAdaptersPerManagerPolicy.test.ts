import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  AllowedAdaptersPerManagerPolicy,
  ComptrollerLib,
  IntegrationManager,
  PolicyManager,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  addressListRegistryPerUserPolicyArgs,
  AddressListUpdateType,
  ITestStandardToken,
  MockGenericAdapter,
  MockGenericIntegratee,
  PolicyHook,
  policyManagerConfigArgs,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { createNewFund, deployProtocolFixture, mockGenericSwap } from '@enzymefinance/testutils';
import { BigNumber, constants } from 'ethers';

let fork: ProtocolDeployment;
let allowedAdaptersPerManagerPolicy: AllowedAdaptersPerManagerPolicy;
let fundOwner: SignerWithAddress,
  restrictedManager: SignerWithAddress,
  unrestrictedManager: SignerWithAddress,
  forbiddenManager: SignerWithAddress;
let integrationManager: IntegrationManager;
let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
let policyManager: PolicyManager;
let mockGenericIntegratee: MockGenericIntegratee,
  allowedMockGenericAdapter: MockGenericAdapter,
  unallowedMockGenericAdapter: MockGenericAdapter;

const bypassFlag: BigNumber = constants.MaxUint256;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  allowedAdaptersPerManagerPolicy = fork.deployment.allowedAdaptersPerManagerPolicy;

  [fundOwner, restrictedManager, unrestrictedManager, forbiddenManager] = fork.accounts;
  integrationManager = fork.deployment.integrationManager;
  policyManager = fork.deployment.policyManager;

  mockGenericIntegratee = await MockGenericIntegratee.deploy(fork.deployer);
  allowedMockGenericAdapter = await MockGenericAdapter.deploy(fork.deployer, mockGenericIntegratee);
  unallowedMockGenericAdapter = await MockGenericAdapter.deploy(fork.deployer, mockGenericIntegratee);

  const newFundRes = await createNewFund({
    denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    policyManagerConfig: policyManagerConfigArgs({
      policies: [allowedAdaptersPerManagerPolicy],
      settings: [
        addressListRegistryPerUserPolicyArgs({
          users: [restrictedManager, unrestrictedManager],
          listsData: [
            {
              existingListIds: [0], // Include empty list to test inclusion in 1 list only
              newListsArgs: [
                {
                  initialItems: [allowedMockGenericAdapter],
                  updateType: AddressListUpdateType.None,
                },
              ],
            },
            {
              existingListIds: [bypassFlag],
              newListsArgs: [],
            },
          ],
        }),
      ],
    }),
    signer: fundOwner,
  });

  comptrollerProxy = newFundRes.comptrollerProxy;
  vaultProxy = newFundRes.vaultProxy;

  // add managers
  await vaultProxy.connect(fundOwner).addAssetManagers([restrictedManager, unrestrictedManager, forbiddenManager]);
});

describe('canDisable', () => {
  it('returns true', async () => {
    expect(await allowedAdaptersPerManagerPolicy.canDisable()).toBe(true);
  });
});

describe('implementsHooks', () => {
  it('returns only the correct hook', async () => {
    expect(await allowedAdaptersPerManagerPolicy.implementedHooks()).toMatchFunctionOutput(
      allowedAdaptersPerManagerPolicy.implementedHooks.fragment,
      [PolicyHook.PostCallOnIntegration],
    );
  });
});

// List search condition: The item must be in at least one list
describe('validateRule', () => {
  it('does not allow an unlisted adapter', async () => {
    const swapTx = mockGenericSwap({
      provider,
      comptrollerProxy,
      signer: restrictedManager,
      integrationManager,
      mockGenericAdapter: unallowedMockGenericAdapter,
      vaultProxy,
    });

    await expect(swapTx).rejects.toBeRevertedWith('Rule evaluated to false: ALLOWED_ADAPTERS_PER_MANAGER');
  });

  it('does not allow manager with empty list', async () => {
    const swapTx = mockGenericSwap({
      provider,
      comptrollerProxy,
      signer: forbiddenManager,
      integrationManager,
      mockGenericAdapter: unallowedMockGenericAdapter,
      vaultProxy,
    });

    await expect(swapTx).rejects.toBeRevertedWith('Rule evaluated to false: ALLOWED_ADAPTERS_PER_MANAGER');
  });

  it('allows fund owner', async () => {
    await mockGenericSwap({
      provider,
      comptrollerProxy,
      signer: fundOwner,
      integrationManager,
      mockGenericAdapter: allowedMockGenericAdapter,
      vaultProxy,
    });
  });

  it('allows listed adapter', async () => {
    await mockGenericSwap({
      provider,
      comptrollerProxy,
      signer: restrictedManager,
      integrationManager,
      mockGenericAdapter: allowedMockGenericAdapter,
      vaultProxy,
    });
  });

  it('allows adapter for manager with bypass flag set', async () => {
    await mockGenericSwap({
      provider,
      comptrollerProxy,
      signer: unrestrictedManager,
      integrationManager,
      mockGenericAdapter: allowedMockGenericAdapter,
      vaultProxy,
    });

    await mockGenericSwap({
      provider,
      comptrollerProxy,
      signer: unrestrictedManager,
      integrationManager,
      mockGenericAdapter: unallowedMockGenericAdapter,
      vaultProxy,
    });
  });
});

describe('updateFundSettings', () => {
  it('does not allow update by calling directly', async () => {
    await expect(
      allowedAdaptersPerManagerPolicy.updateFundSettings(
        comptrollerProxy,
        addressListRegistryPerUserPolicyArgs({
          users: [restrictedManager.address],
          listsData: [],
        }),
      ),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('happy path', async () => {
    const listId = BigNumber.from(100);

    expect(
      await allowedAdaptersPerManagerPolicy.getListIdsForFundAndUser(comptrollerProxy, restrictedManager),
    ).not.toContain(listId);

    await policyManager.connect(fundOwner).updatePolicySettingsForFund(
      comptrollerProxy,
      allowedAdaptersPerManagerPolicy,
      addressListRegistryPerUserPolicyArgs({
        users: [restrictedManager.address],
        listsData: [
          {
            existingListIds: [listId],
          },
        ],
      }),
    );

    expect(await allowedAdaptersPerManagerPolicy.getListIdsForFundAndUser(comptrollerProxy, restrictedManager)).toEqual(
      [listId],
    );
  });
});
