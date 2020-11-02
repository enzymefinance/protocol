import { utils } from 'ethers';
import { EthereumTestnetProvider } from '@crestproject/crestproject';
import {
  assertEvent,
  createNewFund,
  defaultTestDeployment,
  engineAdapterTakeOrder,
  getAssetBalances,
  seedAndThawEngine,
  updateChainlinkAggregator,
} from '@melonproject/testutils';
import {
  assetTransferArgs,
  engineTakeOrderArgs,
  SpendAssetsHandleType,
  takeOrderSelector,
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
      config: { mln, weth },
      deployment: { integrationManager, engineAdapter, engine },
    } = await provider.snapshot(snapshot);

    const getIntegrationManagerCall = await engineAdapter.getIntegrationManager();
    expect(getIntegrationManagerCall).toMatchAddress(integrationManager);

    const getEngineCall = await engineAdapter.getEngine();
    expect(getEngineCall).toMatchAddress(engine);

    const getMlnTokenCall = await engineAdapter.getMlnToken();
    expect(getMlnTokenCall).toMatchAddress(mln);

    const getWethTokenCall = await engineAdapter.getWethToken();
    expect(getWethTokenCall).toMatchAddress(weth);
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const {
      deployment: { engineAdapter },
    } = await provider.snapshot(snapshot);

    const args = engineTakeOrderArgs({
      minWethAmount: 1,
      mlnAmount: 1,
    });

    await expect(engineAdapter.parseAssetsForMethod(utils.randomBytes(4), args)).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    await expect(engineAdapter.parseAssetsForMethod(takeOrderSelector, args)).resolves.toBeTruthy();
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

    const args = engineTakeOrderArgs({
      minWethAmount: incomingAmount,
      mlnAmount: outgoingAmount,
    });

    const result = await engineAdapter.parseAssetsForMethod(takeOrderSelector, args);

    expect(result).toMatchFunctionOutput(engineAdapter.parseAssetsForMethod.fragment, {
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset],
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

    const takeOrderArgs = engineTakeOrderArgs({
      minWethAmount: 1,
      mlnAmount: 1,
    });

    const transferArgs = await assetTransferArgs({
      adapter: engineAdapter,
      selector: takeOrderSelector,
      encodedCallArgs: takeOrderArgs,
    });

    await expect(engineAdapter.takeOrder(vaultProxy, takeOrderSelector, transferArgs)).rejects.toBeRevertedWith(
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

    const receipt = await engineAdapterTakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      engineAdapter,
      mln,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      comptrollerProxy: comptrollerProxy,
      vaultProxy: vaultProxy,
      caller: fundOwner,
      adapter: engineAdapter,
      incomingAssets: [weth],
      incomingAssetAmounts: [expectedWeth],
      outgoingAssets: [mln],
      outgoingAssetAmounts: [mlnAmount],
    });

    const [postTxWethBalance, postTxMlnBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, mln],
    });

    expect(postTxWethBalance).toEqBigNumber(preTxWethBalance.add(expectedWeth));
    expect(postTxMlnBalance).toEqBigNumber(preTxMlnBalance.sub(mlnAmount));
  });
});
