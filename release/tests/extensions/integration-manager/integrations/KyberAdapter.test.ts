import { BigNumberish, Signer, utils } from 'ethers';
import { BuidlerProvider, randomAddress } from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { defaultTestDeployment } from '../../../../';
import {
  KyberAdapter,
  ComptrollerLib,
  IntegrationManager,
  VaultLib,
} from '../../../../utils/contracts';
import { IERC20 } from '../../../../codegen/IERC20';
import {
  assetTransferArgs,
  createNewFund,
  kyberTakeOrder,
  kyberTakeOrderArgs,
  takeOrderSelector,
} from '../../../utils';

async function snapshot(provider: BuidlerProvider) {
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
  fundOwner: Signer;
  kyberAdapter: KyberAdapter;
  outgoingAsset: IERC20;
  outgoingAssetAmount?: BigNumberish;
  incomingAsset: IERC20;
  minIncomingAssetAmount?: BigNumberish;
}) {
  await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);

  const [
    preTxIncomingAssetBalance,
    preTxOutgoingAssetBalance,
  ] = await vaultProxy.getAssetBalances([incomingAsset, outgoingAsset]);

  const takeOrderTx = kyberTakeOrder({
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

  const [
    postTxIncomingAssetBalance,
    postTxOutgoingAssetBalance,
  ] = await vaultProxy.getAssetBalances([incomingAsset, outgoingAsset]);

  // TODO: if we use rates other than 1:1, need to look up the actual rate
  const expectedIncomingAssetAmount = outgoingAssetAmount;
  expect(postTxIncomingAssetBalance).toEqBigNumber(
    preTxIncomingAssetBalance.add(expectedIncomingAssetAmount),
  );
  expect(postTxOutgoingAssetBalance).toEqBigNumber(
    preTxOutgoingAssetBalance.sub(outgoingAssetAmount),
  );

  const callOnIntegrationExecutedEvent = integrationManager.abi.getEvent(
    'CallOnIntegrationExecuted',
  );
  await assertEvent(takeOrderTx, callOnIntegrationExecutedEvent, {
    comptrollerProxy: comptrollerProxy.address,
    vaultProxy: vaultProxy.address,
    caller: await fundOwner.getAddress(),
    adapter: kyberAdapter.address,
    incomingAssets: [incomingAsset.address],
    incomingAssetAmounts: [minIncomingAssetAmount],
    outgoingAssets: [outgoingAsset.address],
    outgoingAssetAmounts: [outgoingAssetAmount],
  });
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { integrationManager, kyberAdapter },
      config: {
        integratees: { kyber },
      },
    } = await provider.snapshot(snapshot);

    const getExchangeCall = kyberAdapter.getExchange();
    await expect(getExchangeCall).resolves.toBe(kyber);

    const getIntegrationManagerCall = kyberAdapter.getIntegrationManager();
    await expect(getIntegrationManagerCall).resolves.toBe(
      integrationManager.address,
    );
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const {
      deployment: { kyberAdapter },
    } = await provider.snapshot(snapshot);

    const args = await kyberTakeOrderArgs(
      randomAddress(),
      1,
      randomAddress(),
      1,
    );
    const badSelectorParseAssetsCall = kyberAdapter.parseAssetsForMethod(
      utils.randomBytes(4),
      args,
    );
    await expect(badSelectorParseAssetsCall).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    const goodSelectorParseAssetsCall = kyberAdapter.parseAssetsForMethod(
      takeOrderSelector,
      args,
    );
    await expect(goodSelectorParseAssetsCall).resolves.toBeTruthy();
  });

  it('generates expected output', async () => {
    const {
      deployment: { kyberAdapter },
    } = await provider.snapshot(snapshot);

    const incomingAsset = randomAddress();
    const incomingAmount = utils.parseEther('1');
    const outgoingAsset = randomAddress();
    const outgoingAmount = utils.parseEther('1');

    const takeOrderArgs = await kyberTakeOrderArgs(
      incomingAsset,
      incomingAmount,
      outgoingAsset,
      outgoingAmount,
    );

    const {
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    } = await kyberAdapter.parseAssetsForMethod(
      takeOrderSelector,
      takeOrderArgs,
    );

    expect({
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    }).toMatchObject({
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
      deployment: { kyberAdapter },
      fund: { vaultProxy },
    } = await provider.snapshot(snapshot);

    const takeOrderArgs = await kyberTakeOrderArgs(
      randomAddress(),
      1,
      randomAddress(),
      1,
    );
    const transferArgs = await assetTransferArgs(
      kyberAdapter,
      takeOrderSelector,
      takeOrderArgs,
    );

    const badTakeOrderTx = kyberAdapter.takeOrder(
      vaultProxy,
      takeOrderSelector,
      transferArgs,
    );
    await expect(badTakeOrderTx).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it.todo('does not allow empty incoming asset');

  it.todo('does not allow empty outgoing asset');

  it.todo('does not allow incoming and outgoing assets to be the same');

  it.todo('does not allow empty minimum asset amount');

  it.todo('does not allow empty outgoing asset amount');

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

  it('reverts if the incoming asset amount is too low', async () => {
    const {
      deployment: {
        kyberAdapter,
        tokens: { mln: outgoingAsset, dai: incomingAsset },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const badTakeOrderTx = kyberTakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      kyberAdapter,
      outgoingAsset,
      outgoingAssetAmount: utils.parseEther('1'),
      incomingAsset,
      minIncomingAssetAmount: utils.parseEther('1.0001'),
      seedFund: true,
    });
    await expect(badTakeOrderTx).rejects.toBeRevertedWith(
      'received incoming asset less than expected',
    );
  });

  it.todo('min incoming assets works precisely with non-18 decimal tokens');

  it.todo('figure out a way to test many pairs and conversion rates');
});
