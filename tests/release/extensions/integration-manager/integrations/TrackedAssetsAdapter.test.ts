import { BigNumber, utils } from 'ethers';
import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import {
  defaultTestDeployment,
  assertEvent,
  addTrackedAssets,
  addTrackedAssetsArgs,
  addTrackedAssetsSelector,
  assetTransferArgs,
  createNewFund,
  spendAssetsHandleTypes,
} from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  const [fundOwner, ...remainingAccounts] = accounts;
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

    const getIntegrationManagerCall = trackedAssetsAdapter.getIntegrationManager();
    await expect(getIntegrationManagerCall).resolves.toBe(
      integrationManager.address,
    );
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const {
      deployment: { trackedAssetsAdapter },
    } = await provider.snapshot(snapshot);

    const args = await addTrackedAssetsArgs({
      incomingAssets: [randomAddress()],
    });
    const badSelectorParseAssetsCall = trackedAssetsAdapter.parseAssetsForMethod(
      utils.randomBytes(4),
      args,
    );
    await expect(badSelectorParseAssetsCall).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    const goodSelectorParseAssetsCall = trackedAssetsAdapter.parseAssetsForMethod(
      addTrackedAssetsSelector,
      args,
    );
    await expect(goodSelectorParseAssetsCall).resolves.toBeTruthy();
  });

  it('generates expected output', async () => {
    const {
      deployment: { trackedAssetsAdapter },
    } = await provider.snapshot(snapshot);

    const incomingAsset = randomAddress();
    const args = await addTrackedAssetsArgs({
      incomingAssets: [incomingAsset],
    });

    const {
      spendAssetsHandleType_,
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    } = await trackedAssetsAdapter.parseAssetsForMethod(
      addTrackedAssetsSelector,
      args,
    );

    expect({
      spendAssetsHandleType_,
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    }).toMatchObject({
      spendAssetsHandleType_: spendAssetsHandleTypes.None,
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

    const args = await addTrackedAssetsArgs({
      incomingAssets: [randomAddress()],
    });

    const transferArgs = await assetTransferArgs({
      adapter: trackedAssetsAdapter,
      selector: addTrackedAssetsSelector,
      encodedCallArgs: args,
    });

    const badTx = trackedAssetsAdapter.addTrackedAssets(
      vaultProxy,
      addTrackedAssetsSelector,
      transferArgs,
    );
    await expect(badTx).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
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

    const addTrackedAssetsTx = addTrackedAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      trackedAssetsAdapter,
      incomingAssets,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecutedForFund',
    );
    await assertEvent(
      addTrackedAssetsTx,
      CallOnIntegrationExecutedForFundEvent,
      {
        comptrollerProxy: comptrollerProxy.address,
        vaultProxy: vaultProxy.address,
        caller: await fundOwner.getAddress(),
        adapter: trackedAssetsAdapter.address,
        incomingAssets: [mln.address, weth.address],
        incomingAssetAmounts: [mlnAmount, wethAmount],
        outgoingAssets: [],
        outgoingAssetAmounts: [],
      },
    );

    const trackedAssets = await vaultProxy.getTrackedAssets();
    await expect(
      trackedAssets.includes(mln.address) &&
        trackedAssets.includes(weth.address),
    ).toBe(true);
  });
});
