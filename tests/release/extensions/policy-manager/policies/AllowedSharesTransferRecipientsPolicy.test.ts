import { randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  AllowedSharesTransferRecipientsPolicy,
  ComptrollerLib,
  PolicyManager,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  addressListRegistryPolicyArgs,
  AddressListUpdateType,
  PolicyHook,
  policyManagerConfigArgs,
  StandardToken,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { buyShares, createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';

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
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedSharesTransferRecipientsPolicy],
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
      allowedSharesTransferRecipientsPolicy.updateFundSettings(
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
    expect(await allowedSharesTransferRecipientsPolicy.passesRule(comptrollerProxy, newListAddress)).toBe(false);

    await policyManager.connect(fundOwner).updatePolicySettingsForFund(
      comptrollerProxy,
      allowedSharesTransferRecipientsPolicy,
      addressListRegistryPolicyArgs({
        newListsArgs: [
          {
            initialItems: [newListAddress],
            updateType: AddressListUpdateType.None,
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
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedSharesTransferRecipientsPolicy],
        settings: [
          addressListRegistryPolicyArgs({
            existingListIds: [0], // Include empty list to test inclusion in 1 list only
            newListsArgs: [
              {
                initialItems: [allowedSharesTransferRecipient],
                updateType: AddressListUpdateType.None,
              },
            ],
          }),
        ],
      }),
      signer: fundOwner,
    });

    vaultProxy = newFundRes.vaultProxy;

    await buyShares({
      buyer: sharesTransferSender,
      comptrollerProxy: newFundRes.comptrollerProxy,
      denominationAsset,
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
