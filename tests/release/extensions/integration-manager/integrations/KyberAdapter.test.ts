import { randomAddress } from '@enzymefinance/ethers';
import { EthereumTestnetProvider, SignerWithAddress } from '@enzymefinance/hardhat';
import {
  assetTransferArgs,
  ComptrollerLib,
  IntegrationManager,
  KyberAdapter,
  kyberTakeOrderArgs,
  SpendAssetsHandleType,
  StandardToken,
  takeOrderSelector,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  assertEvent,
  createNewFund,
  defaultTestDeployment,
  getAssetBalances,
  kyberTakeOrder,
} from '@enzymefinance/testutils';
import { BigNumberish, utils } from 'ethers';

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

async function assertKyberTakeOrder({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  kyberAdapter,
  outgoingAsset,
  outgoingAssetAmount = utils.parseEther('1'),
  incomingAsset,
  minIncomingAssetAmount = utils.parseEther('1'),
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  kyberAdapter: KyberAdapter;
  outgoingAsset: StandardToken;
  outgoingAssetAmount?: BigNumberish;
  incomingAsset: StandardToken;
  minIncomingAssetAmount?: BigNumberish;
}) {
  await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);

  const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [incomingAsset, outgoingAsset],
  });

  const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

  const receipt = await kyberTakeOrder({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    kyberAdapter,
    outgoingAsset,
    outgoingAssetAmount,
    incomingAsset,
    minIncomingAssetAmount,
    seedFund: false,
  });

  assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
    comptrollerProxy,
    vaultProxy,
    caller: fundOwner,
    adapter: kyberAdapter,
    selector: takeOrderSelector,
    incomingAssets: [incomingAsset],
    incomingAssetAmounts: [minIncomingAssetAmount],
    outgoingAssets: [outgoingAsset],
    outgoingAssetAmounts: [outgoingAssetAmount],
    integrationData: expect.anything(),
  });

  const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [incomingAsset, outgoingAsset],
  });

  // TODO: if we use rates other than 1:1, need to look up the actual rate
  const expectedIncomingAssetAmount = outgoingAssetAmount;
  expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(expectedIncomingAssetAmount));
  expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(outgoingAssetAmount));
}

xdescribe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { integrationManager, kyberAdapter },
      config: {
        integratees: { kyber },
      },
    } = await provider.snapshot(snapshot);

    const exchangeResult = await kyberAdapter.getExchange();
    expect(exchangeResult).toMatchAddress(kyber);

    const integrationManagerResult = await kyberAdapter.getIntegrationManager();
    expect(integrationManagerResult).toMatchAddress(integrationManager);
  });
});

xdescribe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const {
      deployment: { kyberAdapter },
    } = await provider.snapshot(snapshot);

    const args = kyberTakeOrderArgs({
      incomingAsset: randomAddress(),
      minIncomingAssetAmount: 1,
      outgoingAsset: randomAddress(),
      outgoingAssetAmount: 1,
    });

    await expect(kyberAdapter.parseAssetsForMethod(utils.randomBytes(4), args)).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    await expect(kyberAdapter.parseAssetsForMethod(takeOrderSelector, args)).resolves.toBeTruthy();
  });

  it('generates expected output', async () => {
    const {
      deployment: { kyberAdapter },
    } = await provider.snapshot(snapshot);

    const incomingAsset = randomAddress();
    const minIncomingAssetAmount = utils.parseEther('1');
    const outgoingAsset = randomAddress();
    const outgoingAssetAmount = utils.parseEther('1');

    const takeOrderArgs = kyberTakeOrderArgs({
      incomingAsset,
      minIncomingAssetAmount,
      outgoingAsset,
      outgoingAssetAmount,
    });

    const result = await kyberAdapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(kyberAdapter.parseAssetsForMethod, {
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset],
      spendAssetAmounts_: [outgoingAssetAmount],
      minIncomingAssetAmounts_: [minIncomingAssetAmount],
    });
  });
});

xdescribe('takeOrder', () => {
  it('can only be called via the IntegrationManager', async () => {
    const {
      deployment: { kyberAdapter },
      fund: { vaultProxy },
    } = await provider.snapshot(snapshot);

    const takeOrderArgs = kyberTakeOrderArgs({
      incomingAsset: randomAddress(),
      minIncomingAssetAmount: 1,
      outgoingAsset: randomAddress(),
      outgoingAssetAmount: 1,
    });

    const transferArgs = await assetTransferArgs({
      adapter: kyberAdapter,
      selector: takeOrderSelector,
      encodedCallArgs: takeOrderArgs,
    });

    await expect(kyberAdapter.takeOrder(vaultProxy, takeOrderSelector, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('does not allow incoming and outgoing assets to be the same', async () => {
    const {
      deployment: {
        kyberAdapter,
        tokens: { weth: outgoingAsset, weth: incomingAsset },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    await expect(
      kyberTakeOrder({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        kyberAdapter,
        outgoingAsset,
        outgoingAssetAmount: utils.parseEther('1'),
        incomingAsset,
        seedFund: true,
      }),
    ).rejects.toBeRevertedWith('incomingAsset and outgoingAsset asset cannot be the same');
  });

  it('does not allow empty minimum asset amount', async () => {
    const {
      deployment: {
        kyberAdapter,
        tokens: { weth: outgoingAsset, mln: incomingAsset },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    await expect(
      kyberTakeOrder({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        kyberAdapter,
        outgoingAsset,
        outgoingAssetAmount: utils.parseEther('1'),
        minIncomingAssetAmount: 0,
        incomingAsset,
        seedFund: true,
      }),
    ).rejects.toBeRevertedWith('minIncomingAssetAmount must be >0');
  });

  it('works as expected when called by a fund (ETH to ERC20)', async () => {
    const {
      deployment: {
        kyberAdapter,
        tokens: { weth: outgoingAsset, mln: incomingAsset },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    await assertKyberTakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      kyberAdapter,
      outgoingAsset,
      incomingAsset,
    });
  });

  it('works as expected when called by a fund (ERC20 to ETH)', async () => {
    const {
      deployment: {
        kyberAdapter,
        tokens: { mln: outgoingAsset, weth: incomingAsset },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    await assertKyberTakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      kyberAdapter,
      outgoingAsset,
      incomingAsset,
    });
  });

  it('works as expected when called by a fund (ERC20 to ERC20)', async () => {
    const {
      deployment: {
        kyberAdapter,
        tokens: { mln: outgoingAsset, dai: incomingAsset },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    await assertKyberTakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      kyberAdapter,
      outgoingAsset,
      incomingAsset,
    });
  });

  it.todo('min incoming assets works precisely with non-18 decimal tokens');

  it.todo('figure out a way to test many pairs and conversion rates');
});
