import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { MinAssetBalancesPostRedemptionPolicy } from '@enzymefinance/protocol';
import {
  minAssetBalancesPostRedemptionPolicyArgs,
  ONE_HUNDRED_PERCENT_IN_BPS,
  PolicyHook,
  policyManagerConfigArgs,
  SHARES_UNIT,
  StandardToken,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  redeemSharesForSpecificAssets,
} from '@enzymefinance/testutils';

let fork: ProtocolDeployment;
let minAssetBalancesPostRedemptionPolicy: MinAssetBalancesPostRedemptionPolicy;
beforeEach(async () => {
  fork = await deployProtocolFixture();

  minAssetBalancesPostRedemptionPolicy = fork.deployment.minAssetBalancesPostRedemptionPolicy;
});

describe('constructor', () => {
  it('sets state vars', async () => {
    // PolicyBase
    expect(await minAssetBalancesPostRedemptionPolicy.getPolicyManager()).toMatchAddress(fork.deployment.policyManager);
  });
});

describe('addFundSettings', () => {
  let fundOwner: SignerWithAddress;

  beforeEach(async () => {
    [fundOwner] = fork.accounts;
  });

  it('cannot be called by a random user', async () => {
    await expect(minAssetBalancesPostRedemptionPolicy.addFundSettings(randomAddress(), '0x')).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it.todo('does not allow assets and minBalances array lengths');

  it('happy path', async () => {
    const assets = [
      new StandardToken(fork.config.weth, provider),
      new StandardToken(fork.config.primitives.mln, provider),
    ];
    const minBalances = [123, 456];

    const { comptrollerProxy, receipt } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [minAssetBalancesPostRedemptionPolicy],
        settings: [
          minAssetBalancesPostRedemptionPolicyArgs({
            assets,
            minBalances,
          }),
        ],
      }),
      signer: fundOwner,
    });

    // Assert state and events
    const events = extractEvent(
      receipt,
      minAssetBalancesPostRedemptionPolicy.abi.getEvent('MinAssetBalanceAddedForFund'),
    );
    expect(events.length).toBe(assets.length);
    for (const i in assets) {
      expect(
        await minAssetBalancesPostRedemptionPolicy.getMinAssetBalanceForFund(comptrollerProxy, assets[i]),
      ).toEqBigNumber(minBalances[i]);
      expect(events[i]).toMatchEventArgs({
        asset: assets[i],
        comptrollerProxy,
        minBalance: minBalances[i],
      });
    }
  });
});

describe('canDisable', () => {
  it('returns true', async () => {
    expect(await fork.deployment.minAssetBalancesPostRedemptionPolicy.canDisable()).toBe(true);
  });
});

describe('implementsHooks', () => {
  it('returns only the correct hook', async () => {
    const minAssetBalancesPostRedemptionPolicy = fork.deployment.minAssetBalancesPostRedemptionPolicy;

    expect(await minAssetBalancesPostRedemptionPolicy.implementedHooks()).toMatchFunctionOutput(
      minAssetBalancesPostRedemptionPolicy.implementedHooks.fragment,
      [PolicyHook.RedeemSharesForSpecificAssets],
    );
  });
});

describe('updateFundSettings', () => {
  it('does not allow updates', async () => {
    await expect(
      fork.deployment.minAssetBalancesPostRedemptionPolicy.updateFundSettings(randomAddress(), '0x'),
    ).rejects.toBeRevertedWith('Updates not allowed for this policy');
  });
});

describe('validateRule', () => {
  it('happy path', async () => {
    const [fundOwner] = fork.accounts;
    const denominationAsset = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    const denominationAssetUnit = await getAssetUnit(denominationAsset);
    const minDenominationAssetBalance = denominationAssetUnit.mul(2);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      investment: {
        buyer: fundOwner,
        investmentAmount: minDenominationAssetBalance.mul(4),
        seedBuyer: true,
      },
      policyManagerConfig: policyManagerConfigArgs({
        policies: [minAssetBalancesPostRedemptionPolicy],
        settings: [
          minAssetBalancesPostRedemptionPolicyArgs({
            assets: [denominationAsset],
            minBalances: [minDenominationAssetBalance],
          }),
        ],
      }),
      signer: fundOwner,
    });

    // Attempting to redeem all shares should fail
    await expect(
      redeemSharesForSpecificAssets({
        comptrollerProxy,
        payoutAssetPercentages: [ONE_HUNDRED_PERCENT_IN_BPS],
        payoutAssets: [denominationAsset],
        quantity: await vaultProxy.balanceOf(fundOwner),
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: MIN_ASSET_BALANCES_POST_REDEMPTION');

    // Calc the approx amount of shares that is the limit to redeem based on the min denomination asset balance
    const grossShareValue = await comptrollerProxy.calcGrossShareValue.args(false).call();
    const redeemableDenominationAssetBalance = (await denominationAsset.balanceOf(vaultProxy)).sub(
      minDenominationAssetBalance,
    );
    const approxMaxRedeemableShares = redeemableDenominationAssetBalance.mul(SHARES_UNIT).div(grossShareValue);

    // Attempting to redeem slightly more than the approx allowed shares should fail
    await expect(
      redeemSharesForSpecificAssets({
        comptrollerProxy,
        payoutAssetPercentages: [ONE_HUNDRED_PERCENT_IN_BPS],
        payoutAssets: [denominationAsset],
        quantity: approxMaxRedeemableShares.mul(101).div(100),
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: MIN_ASSET_BALANCES_POST_REDEMPTION');

    // Attempting to redeem slightly below the approx allowed shares should succeed
    await redeemSharesForSpecificAssets({
      comptrollerProxy,
      payoutAssetPercentages: [ONE_HUNDRED_PERCENT_IN_BPS],
      payoutAssets: [denominationAsset],
      quantity: approxMaxRedeemableShares.mul(99).div(100),
      signer: fundOwner,
    });
  });
});
