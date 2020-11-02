import { BigNumber, utils } from 'ethers';
import { EthereumTestnetProvider, randomAddress } from '@crestproject/crestproject';
import { defaultTestDeployment, assertEvent, addTrackedAssets, createNewFund } from '@melonproject/testutils';
import {
  addTrackedAssetsArgs,
  addTrackedAssetsSelector,
  assetTransferArgs,
  SpendAssetsHandleType,
} from '@melonproject/protocol';

async function snapshot(provider: EthereumTestnetProvider) {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
  } = await defaultTestDeployment(provider);

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: config.deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: deployment.tokens.weth,
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
    await expect(trackedAssetsAdapter.parseAssetsForMethod(utils.randomBytes(4), args)).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    await expect(trackedAssetsAdapter.parseAssetsForMethod(addTrackedAssetsSelector, args)).resolves.toBeTruthy();
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
    } = await trackedAssetsAdapter.parseAssetsForMethod(addTrackedAssetsSelector, args);

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
  it('can only be called via the IntegrationManager', async () => {
    const {
      deployment: { trackedAssetsAdapter },
      fund: { vaultProxy },
    } = await provider.snapshot(snapshot);

    const args = addTrackedAssetsArgs([randomAddress()]);

    const transferArgs = await assetTransferArgs({
      adapter: trackedAssetsAdapter,
      selector: addTrackedAssetsSelector,
      encodedCallArgs: args,
    });

    await expect(
      trackedAssetsAdapter.addTrackedAssets(vaultProxy, addTrackedAssetsSelector, transferArgs),
    ).rejects.toBeRevertedWith('Only the IntegrationManager can call this function');
  });

  it('does not allow an already-tracked asset', async () => {
    const {
      deployment: {
        trackedAssetsAdapter,
        integrationManager,
        tokens: { mln },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // Seed fund with untracked MLN
    const incomingAssets = [mln];
    await mln.transfer(vaultProxy, utils.parseEther('1'));

    // Adding MLN as a tracked asset should succeed
    await expect(
      addTrackedAssets({
        comptrollerProxy,
        integrationManager,
        fundOwner,
        trackedAssetsAdapter,
        incomingAssets,
      }),
    ).resolves.toBeReceipt();

    // Attempting to add MLN once already tracked should fail
    await expect(
      addTrackedAssets({
        comptrollerProxy,
        integrationManager,
        fundOwner,
        trackedAssetsAdapter,
        incomingAssets,
      }),
    ).rejects.toBeRevertedWith('Already tracked');
  });

  it('does not allow an asset with no balance in the vault', async () => {
    const {
      deployment: {
        trackedAssetsAdapter,
        integrationManager,
        tokens: { mln },
      },
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshot);

    // Does NOT seed fund with MLN

    // Attempting to add MLN should fail without any MLN balance in the vault
    await expect(
      addTrackedAssets({
        comptrollerProxy,
        integrationManager,
        fundOwner,
        trackedAssetsAdapter,
        incomingAssets: [mln],
      }),
    ).rejects.toBeRevertedWith('Zero balance');
  });

  it('addTrackedAssets successfully', async () => {
    const {
      deployment: {
        trackedAssetsAdapter,
        integrationManager,
        tokens: { mln, weth },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const incomingAssets = [mln, weth];

    const mlnAmount = utils.parseEther('1');
    const wethAmount = utils.parseEther('1');
    await mln.transfer(vaultProxy, mlnAmount);
    await weth.transfer(vaultProxy, wethAmount);

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
      incomingAssets: [mln, weth],
      incomingAssetAmounts: [mlnAmount, wethAmount],
      outgoingAssets: [],
      outgoingAssetAmounts: [],
    });

    const trackedAssets = await vaultProxy.getTrackedAssets();
    expect(trackedAssets.includes(mln.address)).toBe(true);
    expect(trackedAssets.includes(weth.address)).toBe(true);
  });
});
