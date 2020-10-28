import { utils } from 'ethers';
import { EthereumTestnetProvider } from '@crestproject/crestproject';
import {
  defaultTestDeployment,
  assertEvent,
  assetTransferArgs,
  createNewFund,
  engineAdapterTakeOrder,
  engineAdapterTakeOrderArgs,
  getAssetBalances,
  seedAndThawEngine,
  spendAssetsHandleTypes,
  takeOrderSelector,
  updateChainlinkAggregator,
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
      config: { mln, weth },
      deployment: { integrationManager, engineAdapter, engine },
    } = await provider.snapshot(snapshot);

    const getIntegrationManagerCall = engineAdapter.getIntegrationManager();
    await expect(getIntegrationManagerCall).resolves.toBe(
      integrationManager.address,
    );

    const getEngineCall = engineAdapter.getEngine();
    await expect(getEngineCall).resolves.toBe(engine.address);

    const getMlnTokenCall = engineAdapter.getMlnToken();
    await expect(getMlnTokenCall).resolves.toBe(mln);

    const getWethTokenCall = engineAdapter.getWethToken();
    await expect(getWethTokenCall).resolves.toBe(weth);
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const {
      deployment: { engineAdapter },
    } = await provider.snapshot(snapshot);

    const args = await engineAdapterTakeOrderArgs({
      minWethAmount: 1,
      mlnAmount: 1,
    });
    const badSelectorParseAssetsCall = engineAdapter.parseAssetsForMethod(
      utils.randomBytes(4),
      args,
    );
    await expect(badSelectorParseAssetsCall).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    const goodSelectorParseAssetsCall = engineAdapter.parseAssetsForMethod(
      takeOrderSelector,
      args,
    );
    await expect(goodSelectorParseAssetsCall).resolves.toBeTruthy();
  });

  it('correctly handles valid call', async () => {
    const {
      deployment: {
        engineAdapter,
        tokens: { weth, mln },
      },
    } = await provider.snapshot(snapshot);

    const incomingAsset = weth;
    const incomingAmount = utils.parseEther('1');
    const outgoingAmount = utils.parseEther('1');
    const outgoingAsset = mln;

    const args = await engineAdapterTakeOrderArgs({
      minWethAmount: incomingAmount,
      mlnAmount: outgoingAmount,
    });

    const {
      spendAssetsHandleType_,
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    } = await engineAdapter.parseAssetsForMethod(takeOrderSelector, args);

    expect({
      spendAssetsHandleType_,
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    }).toMatchObject({
      spendAssetsHandleType_: spendAssetsHandleTypes.Transfer,
      incomingAssets_: [incomingAsset.address],
      spendAssets_: [outgoingAsset.address],
      spendAssetAmounts_: [outgoingAmount],
      minIncomingAssetAmounts_: [incomingAmount],
    });
  });
});

describe('takeOrder', () => {
  it('can only be called via the IntegrationManager', async () => {
    const {
      deployment: { engineAdapter },
      fund: { vaultProxy },
    } = await provider.snapshot(snapshot);

    const takeOrderArgs = await engineAdapterTakeOrderArgs({
      minWethAmount: 1,
      mlnAmount: 1,
    });

    const transferArgs = await assetTransferArgs({
      adapter: engineAdapter,
      selector: takeOrderSelector,
      encodedCallArgs: takeOrderArgs,
    });

    const badTakeOrderTx = engineAdapter.takeOrder(
      vaultProxy,
      takeOrderSelector,
      transferArgs,
    );
    await expect(badTakeOrderTx).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('correctly handles valid call', async () => {
    const {
      deployment: {
        engine,
        engineAdapter,
        tokens: { weth, mln },
        integrationManager,
        chainlinkAggregators,
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const mlnAmount = utils.parseEther('1');

    // Expected WETH Given an initial rate 1:1 and 5% premium fee
    const expectedWeth = utils.parseEther('1.05');

    // Seeds the engine with the amount of ETH needed
    await seedAndThawEngine(provider, engine, expectedWeth);
    await updateChainlinkAggregator(chainlinkAggregators.mln);

    // Seed vault with enough MLN for the transaction
    await mln.transfer(vaultProxy, mlnAmount);

    const [preTxWethBalance, preTxMlnBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, mln],
    });

    const takeOrderTx = await engineAdapterTakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      engineAdapter,
      mln,
    });

    const [postTxWethBalance, postTxMlnBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, mln],
    });

    expect(postTxWethBalance).toEqBigNumber(preTxWethBalance.add(expectedWeth));
    expect(postTxMlnBalance).toEqBigNumber(preTxMlnBalance.sub(mlnAmount));

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecutedForFund',
    );

    await assertEvent(takeOrderTx, CallOnIntegrationExecutedForFundEvent, {
      comptrollerProxy: comptrollerProxy.address,
      vaultProxy: vaultProxy.address,
      caller: await fundOwner.getAddress(),
      adapter: engineAdapter.address,
      incomingAssets: [weth.address],
      incomingAssetAmounts: [expectedWeth],
      outgoingAssets: [mln.address],
      outgoingAssetAmounts: [mlnAmount],
    });
  });
});
