import { randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  addressListRegistryPolicyArgs,
  AllowedDepositRecipientsPolicy,
  PolicyHook,
  ComptrollerLib,
  StandardToken,
  policyManagerConfigArgs,
  PolicyManager,
  AddressListUpdateType,
} from '@enzymefinance/protocol';
import { buyShares, createNewFund, deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';

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
      signer: fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedDepositRecipientsPolicy],
        settings: [
          addressListRegistryPolicyArgs({
            newListsArgs: [
              {
                updateType: AddressListUpdateType.None,
                initialItems: [],
              },
            ],
          }),
        ],
      }),
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
              updateType: AddressListUpdateType.None,
              initialItems: [newListAddress],
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
            updateType: AddressListUpdateType.None,
            initialItems: [newListAddress],
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
      signer: fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedDepositRecipientsPolicy],
        settings: [
          addressListRegistryPolicyArgs({
            existingListIds: [0], // Include empty list to test inclusion in 1 list only
            newListsArgs: [
              {
                updateType: AddressListUpdateType.None,
                initialItems: [allowedDepositRecipient],
              },
            ],
          }),
        ],
      }),
    });
    comptrollerProxy = newFundRes.comptrollerProxy;
  });

  it('does not allow an unlisted recipient', async () => {
    await expect(
      buyShares({
        comptrollerProxy,
        denominationAsset,
        buyer: nonAllowedDepositRecipient,
        seedBuyer: true,
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: ALLOWED_DEPOSIT_RECIPIENTS');
  });

  it('allows a listed recipient', async () => {
    await buyShares({
      comptrollerProxy,
      denominationAsset,
      buyer: allowedDepositRecipient,
      seedBuyer: true,
    });
  });
});
