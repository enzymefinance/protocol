import type { AddressLike } from '@enzymefinance/ethers';
import { randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  ComptrollerLib,
  ExternalPositionManager,
  OnlyRemoveDustExternalPositionPolicy,
  ValueInterpreter,
} from '@enzymefinance/protocol';
import { ITestStandardToken, ONE_DAY_IN_SECONDS, PolicyHook, policyManagerConfigArgs } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  createMockExternalPosition,
  createNewFund,
  deployProtocolFixture,
  mockExternalPositionAddDebtAssets,
  mockExternalPositionAddManagedAssets,
  mockExternalPositionRemoveManagedAssets,
  removeExternalPosition,
  vaultCallStartAssetBypassTimelock,
} from '@enzymefinance/testutils';
import type { BigNumber } from 'ethers';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const onlyRemoveDustExternalPositionPolicy = fork.deployment.onlyRemoveDustExternalPositionPolicy;

    // DustEvaluatorMixin
    expect(await onlyRemoveDustExternalPositionPolicy.getFundDeployer()).toMatchAddress(fork.deployment.fundDeployer);

    // PolicyBase
    expect(await onlyRemoveDustExternalPositionPolicy.getPolicyManager()).toMatchAddress(fork.deployment.policyManager);

    // PricelessAssetBypassMixin
    expect(await onlyRemoveDustExternalPositionPolicy.getPricelessAssetBypassTimeLimit()).toEqBigNumber(
      ONE_DAY_IN_SECONDS * 2,
    );
    expect(await onlyRemoveDustExternalPositionPolicy.getPricelessAssetBypassTimelock()).toEqBigNumber(
      ONE_DAY_IN_SECONDS * 7,
    );
    expect(await onlyRemoveDustExternalPositionPolicy.getPricelessAssetBypassValueInterpreter()).toMatchAddress(
      fork.deployment.valueInterpreter,
    );
    expect(await onlyRemoveDustExternalPositionPolicy.getPricelessAssetBypassWethToken()).toMatchAddress(
      fork.config.weth,
    );
  });
});

describe('canDisable', () => {
  it('returns false', async () => {
    expect(await fork.deployment.onlyRemoveDustExternalPositionPolicy.canDisable()).toBe(false);
  });
});

describe('implementsHooks', () => {
  it('returns only the correct hook', async () => {
    const onlyRemoveDustExternalPositionPolicy = fork.deployment.onlyRemoveDustExternalPositionPolicy;

    expect(await onlyRemoveDustExternalPositionPolicy.implementedHooks()).toMatchFunctionOutput(
      onlyRemoveDustExternalPositionPolicy.implementedHooks.fragment,
      [PolicyHook.RemoveExternalPosition],
    );
  });
});

describe('updateFundSettings', () => {
  it('does not allow updates', async () => {
    await expect(
      fork.deployment.onlyRemoveDustExternalPositionPolicy.updateFundSettings(randomAddress(), '0x'),
    ).rejects.toBeRevertedWith('Updates not allowed for this policy');
  });
});

describe('validateRule', () => {
  let fundOwner: SignerWithAddress;
  let comptrollerProxy: ComptrollerLib;
  let onlyRemoveDustExternalPositionPolicy: OnlyRemoveDustExternalPositionPolicy,
    externalPositionManager: ExternalPositionManager,
    valueInterpreter: ValueInterpreter;
  let mockExternalPositionProxyAddress: AddressLike;
  let weth: ITestStandardToken;
  let dustToleranceInWeth: BigNumber;

  beforeEach(async () => {
    [fundOwner] = fork.accounts;
    onlyRemoveDustExternalPositionPolicy = fork.deployment.onlyRemoveDustExternalPositionPolicy;
    externalPositionManager = fork.deployment.externalPositionManager;
    valueInterpreter = fork.deployment.valueInterpreter;
    weth = new ITestStandardToken(fork.config.weth, provider);

    const newFundRes = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      policyManagerConfig: policyManagerConfigArgs({
        policies: [onlyRemoveDustExternalPositionPolicy],
        settings: ['0x'],
      }),
      signer: fundOwner,
    });

    comptrollerProxy = newFundRes.comptrollerProxy;

    // Confirm dust tolerance is set
    dustToleranceInWeth = await onlyRemoveDustExternalPositionPolicy.getDustToleranceInWeth();
    expect(dustToleranceInWeth).toBeGtBigNumber(0);

    const { externalPositionProxy } = await createMockExternalPosition({
      comptrollerProxy,
      defaultActionAmountsToTransfer: [],
      defaultActionAssetsToReceive: [],
      defaultActionAssetsToTransfer: [],
      deployer: fork.deployer,
      externalPositionFactory: fork.deployment.externalPositionFactory,
      externalPositionManager,
      fundOwner,
    });

    mockExternalPositionProxyAddress = externalPositionProxy;
  });

  it('cannot be called by a random user', async () => {
    await expect(onlyRemoveDustExternalPositionPolicy.validateRule(comptrollerProxy, 0, '0x')).rejects.toBeRevertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('happy path: external position has negative value', async () => {
    // Add more weth as debt asset than managed asset

    await mockExternalPositionAddManagedAssets({
      amounts: [1],
      assets: [weth],
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: mockExternalPositionProxyAddress,
      signer: fundOwner,
    });

    await mockExternalPositionAddDebtAssets({
      amounts: [2],
      assets: [weth],
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: mockExternalPositionProxyAddress,
      signer: fundOwner,
    });

    await removeExternalPosition({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: mockExternalPositionProxyAddress,
      signer: fundOwner,
    });
  });

  it('happy path: external position under the dust threshold', async () => {
    // First, add 'dust threshold plus 2 wei' as managed asset, and 1 wei as debt asset so the position is exactly 1 wei over the dust threshold

    await mockExternalPositionAddDebtAssets({
      amounts: [1],
      assets: [weth],
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: mockExternalPositionProxyAddress,
      signer: fundOwner,
    });

    await mockExternalPositionAddManagedAssets({
      amounts: [dustToleranceInWeth.add(2)],
      assets: [weth],
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: mockExternalPositionProxyAddress,
      signer: fundOwner,
    });

    // Tx should fail at 1 wei too great
    await expect(
      removeExternalPosition({
        comptrollerProxy,
        externalPositionManager,
        externalPositionProxy: mockExternalPositionProxyAddress,
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: ONLY_REMOVE_DUST_EXTERNAL_POSITION');

    // After removing 1 wei from managed assets, the tx should succeed
    await mockExternalPositionRemoveManagedAssets({
      amounts: [1],
      assets: [weth],
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: mockExternalPositionProxyAddress,
      signer: fundOwner,
    });

    await removeExternalPosition({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: mockExternalPositionProxyAddress,
      signer: fundOwner,
    });
  });

  it('happy path: external position with a priceless managed asset that has been properly queued', async () => {
    const pricelessAsset = new ITestStandardToken(fork.config.primitives.usdc, provider);

    // Add a too-high amount of managed asset
    const dustThresholdInPricelessAsset = await valueInterpreter.calcCanonicalAssetValue
      .args(weth, dustToleranceInWeth, pricelessAsset)
      .call();

    await mockExternalPositionAddManagedAssets({
      amounts: [dustThresholdInPricelessAsset.mul(2)],
      assets: [pricelessAsset],
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: mockExternalPositionProxyAddress,
      signer: fundOwner,
    });

    // Remove the managed asset's price
    await valueInterpreter.removePrimitives([pricelessAsset]);

    await expect(
      removeExternalPosition({
        comptrollerProxy,
        externalPositionManager,
        externalPositionProxy: mockExternalPositionProxyAddress,
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Invalid asset not bypassable');

    await vaultCallStartAssetBypassTimelock({
      asset: pricelessAsset,
      comptrollerProxy,
      contract: onlyRemoveDustExternalPositionPolicy,
    });

    // Same untracking tx should work within the allowed asset bypass window
    await provider.send('evm_increaseTime', [
      (await onlyRemoveDustExternalPositionPolicy.getPricelessAssetBypassTimelock()).toNumber(),
    ]);

    await removeExternalPosition({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: mockExternalPositionProxyAddress,
      signer: fundOwner,
    });
  });
});
