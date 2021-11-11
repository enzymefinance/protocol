import { randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { AllowedDepositRecipientsPolicy, ComptrollerLib, PolicyManager } from '@enzymefinance/protocol';
import {
  addressListRegistryPolicyArgs,
  AddressListUpdateType,
  PolicyHook,
  policyManagerConfigArgs,
  StandardToken,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { buyShares, createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const allowedDepositRecipientsPolicy = fork.deployment.allowedDepositRecipientsPolicy;

    expect(await allowedDepositRecipientsPolicy.getPolicyManager()).toMatchAddress(fork.deployment.policyManager);

    // AddressListRegistryPolicyBase
    expect(await allowedDepositRecipientsPolicy.getAddressListRegistry()).toMatchAddress(
      fork.deployment.addressListRegistry,
    );
  });
});

describe('canDisable', () => {
  it('returns true', async () => {
    expect(await fork.deployment.allowedDepositRecipientsPolicy.canDisable()).toBe(true);
  });
});

describe('implementsHooks', () => {
  it('returns only the correct hook', async () => {
    const allowedDepositRecipientsPolicy = fork.deployment.allowedDepositRecipientsPolicy;

    expect(await allowedDepositRecipientsPolicy.implementedHooks()).toMatchFunctionOutput(
      allowedDepositRecipientsPolicy.implementedHooks.fragment,
      [PolicyHook.PostBuyShares],
    );
  });
});

describe('updateFundSettings', () => {
  const newListAddress = randomAddress();
  let fundOwner: SignerWithAddress;
  let policyManager: PolicyManager, allowedDepositRecipientsPolicy: AllowedDepositRecipientsPolicy;
  let comptrollerProxy: ComptrollerLib;

  beforeEach(async () => {
    [fundOwner] = fork.accounts;
    allowedDepositRecipientsPolicy = fork.deployment.allowedDepositRecipientsPolicy;
    policyManager = fork.deployment.policyManager;

    const newFundRes = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedDepositRecipientsPolicy],
        settings: [
          addressListRegistryPolicyArgs({
            newListsArgs: [
              {
                initialItems: [],
                updateType: AddressListUpdateType.None,
              },
            ],
          }),
        ],
      }),
      signer: fundOwner,
    });
    comptrollerProxy = newFundRes.comptrollerProxy;
  });

  it('does not allow calling directly', async () => {
    await expect(
      allowedDepositRecipientsPolicy.updateFundSettings(
        comptrollerProxy,
        addressListRegistryPolicyArgs({
          newListsArgs: [
            {
              initialItems: [newListAddress],
              updateType: AddressListUpdateType.None,
            },
          ],
        }),
      ),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('happy path', async () => {
    expect(await allowedDepositRecipientsPolicy.passesRule(comptrollerProxy, newListAddress)).toBe(false);

    await policyManager.connect(fundOwner).updatePolicySettingsForFund(
      comptrollerProxy,
      allowedDepositRecipientsPolicy,
      addressListRegistryPolicyArgs({
        newListsArgs: [
          {
            initialItems: [newListAddress],
            updateType: AddressListUpdateType.None,
          },
        ],
      }),
    );

    expect(await allowedDepositRecipientsPolicy.passesRule(comptrollerProxy, newListAddress)).toBe(true);
  });
});

// List search condition: The item must be in at least one list
describe('validateRule', () => {
  let fundOwner: SignerWithAddress,
    allowedDepositRecipient: SignerWithAddress,
    nonAllowedDepositRecipient: SignerWithAddress;
  let allowedDepositRecipientsPolicy: AllowedDepositRecipientsPolicy;
  let comptrollerProxy: ComptrollerLib;
  let denominationAsset: StandardToken;

  beforeEach(async () => {
    [fundOwner, allowedDepositRecipient, nonAllowedDepositRecipient] = fork.accounts;
    allowedDepositRecipientsPolicy = fork.deployment.allowedDepositRecipientsPolicy;

    denominationAsset = new StandardToken(fork.config.primitives.usdc, whales.usdc);

    const newFundRes = await createNewFund({
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedDepositRecipientsPolicy],
        settings: [
          addressListRegistryPolicyArgs({
            existingListIds: [0], // Include empty list to test inclusion in 1 list only
            newListsArgs: [
              {
                initialItems: [allowedDepositRecipient],
                updateType: AddressListUpdateType.None,
              },
            ],
          }),
        ],
      }),
      signer: fundOwner,
    });
    comptrollerProxy = newFundRes.comptrollerProxy;
  });

  it('does not allow an unlisted recipient', async () => {
    await expect(
      buyShares({
        buyer: nonAllowedDepositRecipient,
        comptrollerProxy,
        denominationAsset,
        seedBuyer: true,
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: ALLOWED_DEPOSIT_RECIPIENTS');
  });

  it('allows a listed recipient', async () => {
    await buyShares({
      buyer: allowedDepositRecipient,
      comptrollerProxy,
      denominationAsset,
      seedBuyer: true,
    });
  });
});
