import { randomAddress } from '@enzymefinance/ethers';
import {
  addTrackedAssetsArgs,
  addTrackedAssetsSelector,
  StandardToken,
  SpendAssetsHandleType,
} from '@enzymefinance/protocol';
import { addTrackedAssets, assertEvent, createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';
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
      deployment: { integrationManager, trackedAssetsAdapter },
    } = await provider.snapshot(snapshot);

    const getIntegrationManagerCall = await trackedAssetsAdapter.getIntegrationManager();
    expect(getIntegrationManagerCall).toMatchAddress(integrationManager);
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const {
      deployment: { trackedAssetsAdapter },
    } = await provider.snapshot(snapshot);

    const args = addTrackedAssetsArgs([randomAddress()]);
    await expect(
      trackedAssetsAdapter.parseAssetsForMethod(randomAddress(), utils.randomBytes(4), args),
    ).rejects.toBeRevertedWith('_selector invalid');

    await expect(
      trackedAssetsAdapter.parseAssetsForMethod(randomAddress(), addTrackedAssetsSelector, args),
    ).resolves.toBeTruthy();
  });

  it('generates expected output', async () => {
    const {
      deployment: { trackedAssetsAdapter },
    } = await provider.snapshot(snapshot);

    const incomingAsset = randomAddress();
    const args = addTrackedAssetsArgs([incomingAsset]);

    const {
      spendAssetsHandleType_,
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    } = await trackedAssetsAdapter.parseAssetsForMethod(randomAddress(), addTrackedAssetsSelector, args);

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
