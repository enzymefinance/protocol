import { utils } from 'ethers';
import {
  EthereumTestnetProvider,
  randomAddress,
  resolveAddress,
} from '@crestproject/crestproject';
import {
  defaultTestDeployment,
  createNewFund,
  lendSelector,
  compoundArgs,
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
      deployment: { compoundAdapter, integrationManager },
    } = await provider.snapshot(snapshot);

    const getIntegrationManagerCall = compoundAdapter.getIntegrationManager();
    await expect(getIntegrationManagerCall).resolves.toBe(
      integrationManager.address,
    );
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const {
      deployment: { compoundAdapter },
    } = await provider.snapshot(snapshot);

    const outgoingAsset = randomAddress();
    const incomingAsset = randomAddress();

    const args = await compoundArgs({
      outgoingAsset,
      incomingAsset,
      minIncomingAssetAmount: utils.parseEther('1'),
      outgoingAssetAmount: utils.parseEther('1'),
    });
    const badSelectorParseAssetsCall = compoundAdapter.parseAssetsForMethod(
      utils.randomBytes(4),
      args,
    );
    await expect(badSelectorParseAssetsCall).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    const goodSelectorParseAssetsCall = compoundAdapter.parseAssetsForMethod(
      lendSelector,
      args,
    );
    await expect(goodSelectorParseAssetsCall).resolves.toBeTruthy();
  });

  it('generates expected output for lending and redeeming', async () => {
    const {
      deployment: { compoundAdapter },
    } = await provider.snapshot(snapshot);

    const outgoingAsset = randomAddress();
    const incomingAsset = randomAddress();
    const minIncomingAssetAmount = utils.parseEther('1');
    const outgoingAssetAmount = utils.parseEther('1');

    const args = await compoundArgs({
      outgoingAsset,
      incomingAsset,
      minIncomingAssetAmount,
      outgoingAssetAmount,
    });
    const selector = lendSelector;

    const {
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    } = await compoundAdapter.parseAssetsForMethod(selector, args);

    expect({
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    }).toMatchObject({
      incomingAssets_: [resolveAddress(incomingAsset)],
      spendAssets_: [resolveAddress(outgoingAsset)],
      spendAssetAmounts_: [outgoingAssetAmount],
      minIncomingAssetAmounts_: [minIncomingAssetAmount],
    });
  });
});
