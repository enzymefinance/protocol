import { randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  ComptrollerLib,
  IntegrationManager,
  OnlyUntrackDustOrPricelessAssetsPolicy,
  ValueInterpreter,
  VaultLib,
} from '@enzymefinance/protocol';
import { ITestStandardToken, ONE_DAY_IN_SECONDS, PolicyHook, policyManagerConfigArgs } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  addNewAssetsToFund,
  createNewFund,
  deployProtocolFixture,
  removeTrackedAssetsFromVault,
  seedAccount,
  vaultCallStartAssetBypassTimelock,
} from '@enzymefinance/testutils';
import type { BigNumber } from 'ethers';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const onlyUntrackDustOrPricelessAssetsPolicy = fork.deployment.onlyUntrackDustOrPricelessAssetsPolicy;

    // DustEvaluatorMixin
    expect(await onlyUntrackDustOrPricelessAssetsPolicy.getFundDeployer()).toMatchAddress(fork.deployment.fundDeployer);

    // PolicyBase
    expect(await onlyUntrackDustOrPricelessAssetsPolicy.getPolicyManager()).toMatchAddress(
      fork.deployment.policyManager,
    );

    // PricelessAssetBypassMixin
    expect(await onlyUntrackDustOrPricelessAssetsPolicy.getPricelessAssetBypassTimeLimit()).toEqBigNumber(
      ONE_DAY_IN_SECONDS * 2,
    );
    expect(await onlyUntrackDustOrPricelessAssetsPolicy.getPricelessAssetBypassTimelock()).toEqBigNumber(
      ONE_DAY_IN_SECONDS * 7,
    );
    expect(await onlyUntrackDustOrPricelessAssetsPolicy.getPricelessAssetBypassValueInterpreter()).toMatchAddress(
      fork.deployment.valueInterpreter,
    );
    expect(await onlyUntrackDustOrPricelessAssetsPolicy.getPricelessAssetBypassWethToken()).toMatchAddress(
      fork.config.weth,
    );
  });
});

describe('canDisable', () => {
  it('returns false', async () => {
    expect(await fork.deployment.onlyUntrackDustOrPricelessAssetsPolicy.canDisable()).toBe(false);
  });
});

describe('implementsHooks', () => {
  it('returns only the correct hook', async () => {
    const onlyUntrackDustOrPricelessAssetsPolicy = fork.deployment.onlyUntrackDustOrPricelessAssetsPolicy;

    expect(await onlyUntrackDustOrPricelessAssetsPolicy.implementedHooks()).toMatchFunctionOutput(
      onlyUntrackDustOrPricelessAssetsPolicy.implementedHooks.fragment,
      [PolicyHook.RemoveTrackedAssets],
    );
  });
});

describe('updateFundSettings', () => {
  it('does not allow updates', async () => {
    await expect(
      fork.deployment.onlyUntrackDustOrPricelessAssetsPolicy.updateFundSettings(randomAddress(), '0x'),
    ).rejects.toBeRevertedWith('Updates not allowed for this policy');
  });
});

describe('validateRule', () => {
  let fundOwner: SignerWithAddress;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let onlyUntrackDustOrPricelessAssetsPolicy: OnlyUntrackDustOrPricelessAssetsPolicy,
    integrationManager: IntegrationManager,
    valueInterpreter: ValueInterpreter;
  let weth: ITestStandardToken, assetsToUntrack: ITestStandardToken[];
  let dustToleranceInAssetsToRemove: BigNumber[];

  beforeEach(async () => {
    [fundOwner] = fork.accounts;
    onlyUntrackDustOrPricelessAssetsPolicy = fork.deployment.onlyUntrackDustOrPricelessAssetsPolicy;
    integrationManager = fork.deployment.integrationManager;
    valueInterpreter = fork.deployment.valueInterpreter;
    weth = new ITestStandardToken(fork.config.weth, provider);
    assetsToUntrack = [
      new ITestStandardToken(fork.config.primitives.dai, provider),
      new ITestStandardToken(fork.config.primitives.usdt, provider),
    ];

    const newFundRes = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [onlyUntrackDustOrPricelessAssetsPolicy],
        settings: ['0x'],
      }),
      signer: fundOwner,
    });

    comptrollerProxy = newFundRes.comptrollerProxy;
    vaultProxy = newFundRes.vaultProxy;

    const dustToleranceInWeth = await onlyUntrackDustOrPricelessAssetsPolicy.getDustToleranceInWeth();

    expect(dustToleranceInWeth).toBeGtBigNumber(0);
    dustToleranceInAssetsToRemove = await Promise.all(
      assetsToUntrack.map((asset) =>
        valueInterpreter.calcCanonicalAssetValue.args(weth, dustToleranceInWeth, asset).call(),
      ),
    );

    // Add just under the allowed dust threshold of each asset to the fund
    await addNewAssetsToFund({
      provider,
      amounts: dustToleranceInAssetsToRemove.map((dust) => dust.mul(99).div(100)),
      assets: assetsToUntrack,
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      signer: fundOwner,
    });
  });

  it('cannot be called by a random user', async () => {
    await expect(
      onlyUntrackDustOrPricelessAssetsPolicy.validateRule(comptrollerProxy, 0, '0x'),
    ).rejects.toBeRevertedWith('Only the PolicyManager can make this call');
  });

  it('does not allow any asset amount that is greater than the dust value', async () => {
    // Add enough of one of the assetsToUntrack to put it over the dust threshold.
    // Sending 2% of the threshold accomplishes this.
    const balance = await assetsToUntrack[0].balanceOf(vaultProxy);
    await seedAccount({
      account: vaultProxy,
      amount: balance.add(dustToleranceInAssetsToRemove[0].mul(2).div(100)),
      provider,
      token: assetsToUntrack[0],
    });

    await expect(
      removeTrackedAssetsFromVault({
        assets: assetsToUntrack,
        comptrollerProxy,
        integrationManager,
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: ONLY_UNTRACK_DUST_OR_PRICELESS_ASSETS');
  });

  it('happy path: no assets over the dust threshold', async () => {
    await removeTrackedAssetsFromVault({
      assets: assetsToUntrack,
      comptrollerProxy,
      integrationManager,
      signer: fundOwner,
    });
  });

  it('happy path: priceless asset that has been properly queued', async () => {
    const pricelessAsset = assetsToUntrack[0];

    await valueInterpreter.removePrimitives([pricelessAsset]);

    await expect(
      removeTrackedAssetsFromVault({
        assets: assetsToUntrack,
        comptrollerProxy,
        integrationManager,
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Invalid asset not bypassable');

    await vaultCallStartAssetBypassTimelock({
      asset: pricelessAsset,
      comptrollerProxy,
      contract: onlyUntrackDustOrPricelessAssetsPolicy,
    });

    // Same untracking tx should work within the allowed asset bypass window
    await provider.send('evm_increaseTime', [
      (await onlyUntrackDustOrPricelessAssetsPolicy.getPricelessAssetBypassTimelock()).toNumber(),
    ]);

    await removeTrackedAssetsFromVault({
      assets: assetsToUntrack,
      comptrollerProxy,
      integrationManager,
      signer: fundOwner,
    });
  });
});
