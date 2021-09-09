import { randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  addressListRegistryPolicyArgs,
  AllowedSharesTransferRecipientsPolicy,
  PolicyHook,
  ComptrollerLib,
  StandardToken,
  policyManagerConfigArgs,
  PolicyManager,
  AddressListUpdateType,
  VaultLib,
} from '@enzymefinance/protocol';
import { buyShares, createNewFund, deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';
import { BigNumberish } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const allowedSharesTransferRecipientsPolicy = fork.deployment.allowedSharesTransferRecipientsPolicy;

    expect(await allowedSharesTransferRecipientsPolicy.getPolicyManager()).toMatchAddress(
      fork.deployment.policyManager,
    );

    // AddressListRegistryPolicyBase
    expect(await allowedSharesTransferRecipientsPolicy.getAddressListRegistry()).toMatchAddress(
      fork.deployment.addressListRegistry,
    );
  });
});

describe('canDisable', () => {
  it('returns true', async () => {
    expect(await fork.deployment.allowedSharesTransferRecipientsPolicy.canDisable()).toBe(true);
  });
});

describe('implementsHooks', () => {
  it('returns only the correct hook', async () => {
    const allowedSharesTransferRecipientsPolicy = fork.deployment.allowedSharesTransferRecipientsPolicy;

    expect(await allowedSharesTransferRecipientsPolicy.implementedHooks()).toMatchFunctionOutput(
      allowedSharesTransferRecipientsPolicy.implementedHooks.fragment,
      [PolicyHook.PreTransferShares],
    );
  });
});

describe('updateFundSettings', () => {
  const newListAddress = randomAddress();
  let fundOwner: SignerWithAddress;
  let policyManager: PolicyManager, allowedSharesTransferRecipientsPolicy: AllowedSharesTransferRecipientsPolicy;
  let comptrollerProxy: ComptrollerLib;

  beforeEach(async () => {
    [fundOwner] = fork.accounts;
    allowedSharesTransferRecipientsPolicy = fork.deployment.allowedSharesTransferRecipientsPolicy;
    policyManager = fork.deployment.policyManager;

    const newFundRes = await createNewFund({
      signer: fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedSharesTransferRecipientsPolicy],
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
      allowedSharesTransferRecipientsPolicy.updateFundSettings(
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
    expect(await allowedSharesTransferRecipientsPolicy.passesRule(comptrollerProxy, newListAddress)).toBe(false);

    await policyManager.connect(fundOwner).updatePolicySettingsForFund(
      comptrollerProxy,
      allowedSharesTransferRecipientsPolicy,
      addressListRegistryPolicyArgs({
        newListsArgs: [
          {
            updateType: AddressListUpdateType.None,
            initialItems: [newListAddress],
          },
        ],
      }),
    );

    expect(await allowedSharesTransferRecipientsPolicy.passesRule(comptrollerProxy, newListAddress)).toBe(true);
  });
});

// List search condition: The item must be in at least one list
describe('validateRule', () => {
  let fundOwner: SignerWithAddress,
    sharesTransferSender: SignerWithAddress,
    allowedSharesTransferRecipient: SignerWithAddress,
    nonAllowedSharesTransferRecipient: SignerWithAddress;
  let allowedSharesTransferRecipientsPolicy: AllowedSharesTransferRecipientsPolicy;
  let vaultProxy: VaultLib;
  let denominationAsset: StandardToken;
  let sharesTransferAmount: BigNumberish;

  beforeEach(async () => {
    [fundOwner, sharesTransferSender, allowedSharesTransferRecipient, nonAllowedSharesTransferRecipient] =
      fork.accounts;
    allowedSharesTransferRecipientsPolicy = fork.deployment.allowedSharesTransferRecipientsPolicy;

    denominationAsset = new StandardToken(fork.config.primitives.usdc, whales.usdc);

    const newFundRes = await createNewFund({
      signer: fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedSharesTransferRecipientsPolicy],
        settings: [
          addressListRegistryPolicyArgs({
            existingListIds: [0], // Include empty list to test inclusion in 1 list only
            newListsArgs: [
              {
                updateType: AddressListUpdateType.None,
                initialItems: [allowedSharesTransferRecipient],
              },
            ],
          }),
        ],
      }),
    });
    vaultProxy = newFundRes.vaultProxy;

    await buyShares({
      comptrollerProxy: newFundRes.comptrollerProxy,
      denominationAsset,
      buyer: sharesTransferSender,
      seedBuyer: true,
    });

    sharesTransferAmount = await vaultProxy.balanceOf(sharesTransferSender);
  });

  it('does not allow an unlisted recipient', async () => {
    await expect(
      vaultProxy.connect(sharesTransferSender).transfer(nonAllowedSharesTransferRecipient, sharesTransferAmount),
    ).rejects.toBeRevertedWith('Rule evaluated to false: ALLOWED_SHARES_TRANSFER_RECIPIENTS');
  });

  it('allows a listed recipient', async () => {
    await vaultProxy.connect(sharesTransferSender).transfer(allowedSharesTransferRecipient, sharesTransferAmount);
  });
});
