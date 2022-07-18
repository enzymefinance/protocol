import { randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  AllowedAssetsForRedemptionPolicy,
  ComptrollerLib,
  IntegrationManager,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  addressListRegistryPolicyArgs,
  AddressListUpdateType,
  ITestStandardToken,
  PolicyHook,
  policyManagerConfigArgs,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  addNewAssetsToFund,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  redeemSharesForSpecificAssets,
} from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const allowedAssetsForRedemptionPolicy = fork.deployment.allowedAssetsForRedemptionPolicy;

    expect(await allowedAssetsForRedemptionPolicy.getPolicyManager()).toMatchAddress(fork.deployment.policyManager);

    // AddressListRegistryPolicyBase
    expect(await allowedAssetsForRedemptionPolicy.getAddressListRegistry()).toMatchAddress(
      fork.deployment.addressListRegistry,
    );
  });
});

describe('canDisable', () => {
  it('returns true', async () => {
    expect(await fork.deployment.allowedAssetsForRedemptionPolicy.canDisable()).toBe(true);
  });
});

describe('implementsHooks', () => {
  it('returns only the correct hook', async () => {
    const allowedAssetsForRedemptionPolicy = fork.deployment.allowedAssetsForRedemptionPolicy;

    expect(await allowedAssetsForRedemptionPolicy.implementedHooks()).toMatchFunctionOutput(
      allowedAssetsForRedemptionPolicy.implementedHooks.fragment,
      [PolicyHook.RedeemSharesForSpecificAssets],
    );
  });
});

describe('updateFundSettings', () => {
  it('does not allow updates', async () => {
    await expect(
      fork.deployment.allowedAssetsForRedemptionPolicy.updateFundSettings(randomAddress(), '0x'),
    ).rejects.toBeRevertedWith('Updates not allowed for this policy');
  });
});

// List search condition: All items must be in at least one list
describe('validateRule', () => {
  let fundOwner: SignerWithAddress, investor: SignerWithAddress;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let allowedAssetsForRedemptionPolicy: AllowedAssetsForRedemptionPolicy, integrationManager: IntegrationManager;
  let allowedAsset1: ITestStandardToken, allowedAsset2: ITestStandardToken, notAllowedAsset: ITestStandardToken;
  let sharesToRedeem: BigNumberish;

  beforeEach(async () => {
    [fundOwner, investor] = fork.accounts;
    allowedAssetsForRedemptionPolicy = fork.deployment.allowedAssetsForRedemptionPolicy;
    integrationManager = fork.deployment.integrationManager;

    // Use all USD stable coins to have similar values held by the fund
    const denominationAsset = new ITestStandardToken(fork.config.primitives.usdc, provider);

    allowedAsset1 = denominationAsset;
    allowedAsset2 = new ITestStandardToken(fork.config.primitives.dai, provider);
    notAllowedAsset = new ITestStandardToken(fork.config.primitives.usdt, provider);

    const newFundRes = await createNewFund({
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      investment: {
        buyer: investor,
        investmentAmount: await getAssetUnit(denominationAsset), // Just to be explicit
        provider,
        seedBuyer: true,
      },
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedAssetsForRedemptionPolicy],
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

    // Redeem tiny amount of shares so make payout asset percentages simple
    sharesToRedeem = (await vaultProxy.balanceOf(investor)).div(100);

    // Add 1 unit (1 USD) of all assets to the fund
    await addNewAssetsToFund({
      provider,
      amounts: [
        await getAssetUnit(allowedAsset1),
        await getAssetUnit(allowedAsset2),
        await getAssetUnit(notAllowedAsset),
      ],
      assets: [allowedAsset1, allowedAsset2, notAllowedAsset],
      comptrollerProxy,
      integrationManager,
      signer: fundOwner,
    });
  });

  it('does not allow an unlisted asset', async () => {
    await expect(
      redeemSharesForSpecificAssets({
        comptrollerProxy,
        payoutAssetPercentages: [5000, 5000],
        payoutAssets: [allowedAsset1, notAllowedAsset],
        quantity: sharesToRedeem,
        recipient: investor,
        signer: investor,
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: ALLOWED_ASSETS_FOR_REDEMPTION');
  });

  it('allows listed assets', async () => {
    await redeemSharesForSpecificAssets({
      comptrollerProxy,
      payoutAssetPercentages: [5000, 5000],
      payoutAssets: [allowedAsset1, allowedAsset2],
      quantity: sharesToRedeem,
      recipient: investor,
      signer: investor,
    });
  });
});
