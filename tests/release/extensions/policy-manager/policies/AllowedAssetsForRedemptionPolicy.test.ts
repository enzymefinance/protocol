import { randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  addressListRegistryPolicyArgs,
  AddressListUpdateType,
  AllowedAssetsForRedemptionPolicy,
  ComptrollerLib,
  IntegrationManager,
  PolicyHook,
  policyManagerConfigArgs,
  StandardToken,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  addNewAssetsToFund,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  ProtocolDeployment,
  redeemSharesForSpecificAssets,
} from '@enzymefinance/testutils';
import { BigNumberish } from 'ethers';

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
  let allowedAsset1: StandardToken, allowedAsset2: StandardToken, notAllowedAsset: StandardToken;
  let sharesToRedeem: BigNumberish;

  beforeEach(async () => {
    [fundOwner, investor] = fork.accounts;
    allowedAssetsForRedemptionPolicy = fork.deployment.allowedAssetsForRedemptionPolicy;
    integrationManager = fork.deployment.integrationManager;

    // Use all USD stable coins to have similar values held by the fund
    const denominationAsset = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    allowedAsset1 = denominationAsset;
    allowedAsset2 = new StandardToken(fork.config.primitives.dai, whales.dai);
    notAllowedAsset = new StandardToken(fork.config.primitives.usdt, whales.usdt);

    const newFundRes = await createNewFund({
      signer: fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [allowedAssetsForRedemptionPolicy],
        settings: [
          addressListRegistryPolicyArgs({
            existingListIds: [0], // Include empty list to test inclusion in 1 list only
            newListsArgs: [
              {
                updateType: AddressListUpdateType.None,
                initialItems: [allowedAsset1, allowedAsset2],
              },
            ],
          }),
        ],
      }),
      investment: {
        buyer: investor,
        investmentAmount: await getAssetUnit(denominationAsset), // Just to be explicit
        seedBuyer: true,
      },
    });
    comptrollerProxy = newFundRes.comptrollerProxy;
    vaultProxy = newFundRes.vaultProxy;

    // Redeem tiny amount of shares so make payout asset percentages simple
    sharesToRedeem = (await vaultProxy.balanceOf(investor)).div(100);

    // Add 1 unit (1 USD) of all assets to the fund
    await addNewAssetsToFund({
      signer: fundOwner,
      comptrollerProxy,
      integrationManager,
      assets: [allowedAsset1, allowedAsset2, notAllowedAsset],
      amounts: [
        await getAssetUnit(allowedAsset1),
        await getAssetUnit(allowedAsset2),
        await getAssetUnit(notAllowedAsset),
      ],
    });
  });

  it('does not allow an unlisted asset', async () => {
    await expect(
      redeemSharesForSpecificAssets({
        comptrollerProxy,
        signer: investor,
        recipient: investor,
        quantity: sharesToRedeem,
        payoutAssets: [allowedAsset1, notAllowedAsset],
        payoutAssetPercentages: [5000, 5000],
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: ALLOWED_ASSETS_FOR_REDEMPTION');
  });

  it('allows listed assets', async () => {
    await redeemSharesForSpecificAssets({
      comptrollerProxy,
      signer: investor,
      recipient: investor,
      quantity: sharesToRedeem,
      payoutAssets: [allowedAsset1, allowedAsset2],
      payoutAssetPercentages: [5000, 5000],
    });
  });
});
