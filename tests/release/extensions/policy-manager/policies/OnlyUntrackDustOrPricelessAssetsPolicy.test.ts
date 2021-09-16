import { randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  OnlyUntrackDustOrPricelessAssetsPolicy,
  ComptrollerLib,
  IntegrationManager,
  PolicyHook,
  policyManagerConfigArgs,
  StandardToken,
  VaultLib,
  ValueInterpreter,
  ONE_DAY_IN_SECONDS,
} from '@enzymefinance/protocol';
import {
  addNewAssetsToFund,
  createNewFund,
  deployProtocolFixture,
  ProtocolDeployment,
  removeTrackedAssetsFromVault,
  vaultCallStartAssetBypassTimelock,
} from '@enzymefinance/testutils';
import { BigNumber } from 'ethers';

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
  let weth: StandardToken, assetsToUntrack: StandardToken[];
  let dustToleranceInAssetsToRemove: BigNumber[];

  beforeEach(async () => {
    [fundOwner] = fork.accounts;
    onlyUntrackDustOrPricelessAssetsPolicy = fork.deployment.onlyUntrackDustOrPricelessAssetsPolicy;
    integrationManager = fork.deployment.integrationManager;
    valueInterpreter = fork.deployment.valueInterpreter;
    weth = new StandardToken(fork.config.weth, provider);
    assetsToUntrack = [
      new StandardToken(fork.config.primitives.dai, whales.dai),
      new StandardToken(fork.config.primitives.usdt, whales.usdt),
    ];

    const newFundRes = await createNewFund({
      signer: fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [onlyUntrackDustOrPricelessAssetsPolicy],
        settings: ['0x'],
      }),
    });
    comptrollerProxy = newFundRes.comptrollerProxy;
    vaultProxy = newFundRes.vaultProxy;

    const dustToleranceInWeth = await onlyUntrackDustOrPricelessAssetsPolicy.getDustToleranceInWeth();
    expect(dustToleranceInWeth).toBeGtBigNumber(0);
    dustToleranceInAssetsToRemove = await Promise.all(
      assetsToUntrack.map(
        async (asset) => await valueInterpreter.calcCanonicalAssetValue.args(weth, dustToleranceInWeth, asset).call(),
      ),
    );

    // Add just under the allowed dust threshold of each asset to the fund
    await addNewAssetsToFund({
      signer: fundOwner,
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      assets: assetsToUntrack,
      amounts: dustToleranceInAssetsToRemove.map((dust) => dust.mul(99).div(100)),
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
    await assetsToUntrack[0].transfer(vaultProxy, dustToleranceInAssetsToRemove[0].mul(2).div(100));

    await expect(
      removeTrackedAssetsFromVault({
        signer: fundOwner,
        comptrollerProxy,
        integrationManager,
        assets: assetsToUntrack,
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: ONLY_UNTRACK_DUST_OR_PRICELESS_ASSETS');
  });

  it('happy path: no assets over the dust threshold', async () => {
    await removeTrackedAssetsFromVault({
      signer: fundOwner,
      comptrollerProxy,
      integrationManager,
      assets: assetsToUntrack,
    });
  });

  it('happy path: priceless asset that has been properly queued', async () => {
    const pricelessAsset = assetsToUntrack[0];
    await valueInterpreter.removePrimitives([pricelessAsset]);

    await expect(
      removeTrackedAssetsFromVault({
        signer: fundOwner,
        comptrollerProxy,
        integrationManager,
        assets: assetsToUntrack,
      }),
    ).rejects.toBeRevertedWith('Invalid asset not bypassable');

    await vaultCallStartAssetBypassTimelock({
      comptrollerProxy,
      contract: onlyUntrackDustOrPricelessAssetsPolicy,
      asset: pricelessAsset,
    });

    // Same untracking tx should work within the allowed asset bypass window
    await provider.send('evm_increaseTime', [
      (await onlyUntrackDustOrPricelessAssetsPolicy.getPricelessAssetBypassTimelock()).toNumber(),
    ]);

    await removeTrackedAssetsFromVault({
      signer: fundOwner,
      comptrollerProxy,
      integrationManager,
      assets: assetsToUntrack,
    });
  });
});
