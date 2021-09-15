import { randomAddress } from '@enzymefinance/ethers';
import {
  addTrackedAssetsArgs,
  addTrackedAssetsSelector,
  removeTrackedAssetsArgs,
  removeTrackedAssetsSelector,
  StandardToken,
  SpendAssetsHandleType,
} from '@enzymefinance/protocol';
import {
  addTrackedAssets,
  assertEvent,
  createNewFund,
  deployProtocolFixture,
  removeTrackedAssets,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot() {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployer,
    deployment,
    config,
  } = await deployProtocolFixture();

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: new StandardToken(config.weth, deployer),
  });

  return {
    accounts: remainingAccounts,
    deployment,
    config,
    fund: {
      comptrollerProxy,
      fundOwner,
      vaultProxy,
    },
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      config: { weth },
      deployment: { fundDeployer, integrationManager, trackedAssetsAdapter, valueInterpreter },
    } = await provider.snapshot(snapshot);

    expect(await trackedAssetsAdapter.getDustToleranceInWeth()).toEqBigNumber(utils.parseEther('0.01'));
    expect(await trackedAssetsAdapter.getValueInterpreter()).toMatchAddress(valueInterpreter);
    expect(await trackedAssetsAdapter.getWethToken()).toMatchAddress(weth);

    // AdapterBase
    expect(await trackedAssetsAdapter.getIntegrationManager()).toMatchAddress(integrationManager);

    // FundDeployerOwnerMixin
    expect(await trackedAssetsAdapter.getFundDeployer()).toMatchAddress(fundDeployer);
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const {
      deployment: { trackedAssetsAdapter },
    } = await provider.snapshot(snapshot);

    const args = addTrackedAssetsArgs([randomAddress()]);
    await expect(trackedAssetsAdapter.parseAssetsForMethod(utils.randomBytes(4), args)).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    await expect(trackedAssetsAdapter.parseAssetsForMethod(addTrackedAssetsSelector, args)).resolves.toBeTruthy();
  });

  it('addTrackedAssets: generates expected output', async () => {
    const {
      deployment: { trackedAssetsAdapter },
    } = await provider.snapshot(snapshot);

    const incomingAsset = randomAddress();
    const args = addTrackedAssetsArgs([incomingAsset]);

    const { spendAssetsHandleType_, incomingAssets_, spendAssets_, spendAssetAmounts_, minIncomingAssetAmounts_ } =
      await trackedAssetsAdapter.parseAssetsForMethod(addTrackedAssetsSelector, args);

    expect({
      spendAssetsHandleType_,
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    }).toMatchObject({
      spendAssetsHandleType_: SpendAssetsHandleType.None,
      incomingAssets_: [incomingAsset],
      spendAssets_: [],
      spendAssetAmounts_: [],
      minIncomingAssetAmounts_: [BigNumber.from(1)],
    });
  });

  it('removeTrackedAssets: generates expected output', async () => {
    const {
      deployment: { trackedAssetsAdapter },
    } = await provider.snapshot(snapshot);

    const spendAsset = randomAddress();
    const args = removeTrackedAssetsArgs([spendAsset]);

    const { spendAssetsHandleType_, incomingAssets_, spendAssets_, spendAssetAmounts_, minIncomingAssetAmounts_ } =
      await trackedAssetsAdapter.parseAssetsForMethod(removeTrackedAssetsSelector, args);

    expect({
      spendAssetsHandleType_,
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    }).toMatchObject({
      spendAssetsHandleType_: SpendAssetsHandleType.Remove,
      spendAssets_: [spendAsset],
      spendAssetAmounts_: [BigNumber.from(1)],
      incomingAssets_: [],
      minIncomingAssetAmounts_: [],
    });
  });
});

describe('addTrackedAssets', () => {
  it('addTrackedAssets successfully', async () => {
    const {
      config,
      deployment: { trackedAssetsAdapter, integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const mln = new StandardToken(config.primitives.mln, whales.mln);
    const dai = new StandardToken(config.primitives.dai, whales.dai);

    const incomingAssets = [mln, dai];

    const mlnAmount = utils.parseEther('1');
    const daiAmount = utils.parseEther('1');
    await mln.transfer(vaultProxy, mlnAmount);
    await dai.transfer(vaultProxy, daiAmount);

    const receipt = await addTrackedAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      trackedAssetsAdapter,
      incomingAssets,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      comptrollerProxy,
      vaultProxy,
      caller: fundOwner,
      adapter: trackedAssetsAdapter,
      selector: addTrackedAssetsSelector,
      incomingAssets: [mln, dai],
      incomingAssetAmounts: [mlnAmount, daiAmount],
      outgoingAssets: [],
      outgoingAssetAmounts: [],
      integrationData: expect.anything(),
    });

    const trackedAssets = await vaultProxy.getTrackedAssets();
    expect(trackedAssets.includes(mln.address)).toBe(true);
    expect(trackedAssets.includes(dai.address)).toBe(true);
    expect(await vaultProxy.isTrackedAsset(mln)).toBe(true);
    expect(await vaultProxy.isTrackedAsset(dai)).toBe(true);
  });
});

describe('removeTrackedAssets', () => {
  it('only allows an asset whose balance does not exceed the dust tolerance', async () => {
    const {
      config,
      deployment: { trackedAssetsAdapter, integrationManager, valueInterpreter },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // Calculate an amount of the asset to remove that is greater than the dust tolerance
    const assetToRemove = new StandardToken(config.primitives.usdc, whales.usdc);
    const dustToleranceInWeth = await trackedAssetsAdapter.getDustToleranceInWeth();
    const dustToleranceInAssetToRemove = (
      await valueInterpreter.calcCanonicalAssetValue.args(config.weth, dustToleranceInWeth, assetToRemove).call()
    ).value_;
    const transferAmount = dustToleranceInAssetToRemove.mul(11).div(10); // 10% over tolerance

    // Seed the fund with the larger-than-dust tracked asset
    await assetToRemove.transfer(vaultProxy, transferAmount);
    await addTrackedAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      trackedAssetsAdapter,
      incomingAssets: [assetToRemove],
    });

    // Removing the larger-than-dust tracked asset should fail
    await expect(
      removeTrackedAssets({
        comptrollerProxy,
        integrationManager,
        fundOwner,
        trackedAssetsAdapter,
        spendAssets: [assetToRemove],
      }),
    ).rejects.toBeRevertedWith('Exceeds dust threshold');

    // Increasing the tolerance should allow the removal to pass
    await trackedAssetsAdapter.setDustToleranceInWeth(dustToleranceInWeth.mul(12).div(10)); // raise by 20%

    await removeTrackedAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      trackedAssetsAdapter,
      spendAssets: [assetToRemove],
    });
  });

  it('removes tracked assets successfully', async () => {
    const {
      config,
      deployment: { trackedAssetsAdapter, integrationManager, valueInterpreter },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // Calculate an amount of the asset to remove that is less than the dust tolerance
    const assetToRemove = new StandardToken(config.primitives.usdc, whales.usdc);
    const dustToleranceInWeth = await trackedAssetsAdapter.getDustToleranceInWeth();
    const dustToleranceInAssetToRemove = (
      await valueInterpreter.calcCanonicalAssetValue.args(config.weth, dustToleranceInWeth, assetToRemove).call()
    ).value_;
    const transferAmount = dustToleranceInAssetToRemove.mul(9).div(10); // 10% below tolerance

    // Seed the fund with the less-than-dust tracked asset
    await assetToRemove.transfer(vaultProxy, transferAmount);
    await addTrackedAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      trackedAssetsAdapter,
      incomingAssets: [assetToRemove],
    });

    // Assert the asset to remove is tracked
    expect(await vaultProxy.isTrackedAsset(assetToRemove)).toBe(true);

    await removeTrackedAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      trackedAssetsAdapter,
      spendAssets: [assetToRemove],
    });

    // Assert the asset to remove is no longer tracked
    expect(await vaultProxy.isTrackedAsset(assetToRemove)).toBe(false);
  });
});

describe('setDustToleranceInWeth', () => {
  it('does not allow a random user', async () => {
    const {
      accounts: [randomUser],
      deployment: { trackedAssetsAdapter },
    } = await provider.snapshot(snapshot);

    await expect(trackedAssetsAdapter.connect(randomUser).setDustToleranceInWeth(1)).rejects.toBeRevertedWith(
      'Only the FundDeployer owner can call this function',
    );
  });

  it('correctly updates state and emits the correct event', async () => {
    const {
      deployment: { trackedAssetsAdapter },
    } = await provider.snapshot(snapshot);

    const nextDustToleranceInWeth = (await trackedAssetsAdapter.getDustToleranceInWeth()).add(123);

    const setDustToleranceInWethReceipt = await trackedAssetsAdapter.setDustToleranceInWeth(nextDustToleranceInWeth);

    // Assert state
    expect(await trackedAssetsAdapter.getDustToleranceInWeth()).toEqBigNumber(nextDustToleranceInWeth);

    // Assert the correct event emission
    assertEvent(setDustToleranceInWethReceipt, 'DustToleranceInWethSet', { nextDustToleranceInWeth });
  });
});
