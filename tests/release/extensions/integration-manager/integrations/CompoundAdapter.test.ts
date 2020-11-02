import { utils } from 'ethers';
import { EthereumTestnetProvider, randomAddress } from '@crestproject/crestproject';
import { defaultTestDeployment, createNewFund } from '@melonproject/testutils';
import { compoundArgs, lendSelector } from '@melonproject/protocol';

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
      deployment: { compoundAdapter, integrationManager },
    } = await provider.snapshot(snapshot);

    const getIntegrationManagerCall = await compoundAdapter.getIntegrationManager();
    expect(getIntegrationManagerCall).toMatchAddress(integrationManager);
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const {
      deployment: { compoundAdapter },
    } = await provider.snapshot(snapshot);

    const outgoingAsset = randomAddress();
    const incomingAsset = randomAddress();

    const args = compoundArgs({
      outgoingAsset,
      incomingAsset,
      minIncomingAssetAmount: utils.parseEther('1'),
      outgoingAssetAmount: utils.parseEther('1'),
    });
    await expect(compoundAdapter.parseAssetsForMethod(utils.randomBytes(4), args)).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    await expect(compoundAdapter.parseAssetsForMethod(lendSelector, args)).resolves.toBeTruthy();
  });

  it('generates expected output for lending and redeeming', async () => {
    const {
      deployment: { compoundAdapter },
    } = await provider.snapshot(snapshot);

    const outgoingAsset = randomAddress();
    const incomingAsset = randomAddress();
    const minIncomingAssetAmount = utils.parseEther('1');
    const outgoingAssetAmount = utils.parseEther('1');

    const args = compoundArgs({
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
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset],
      spendAssetAmounts_: [outgoingAssetAmount],
      minIncomingAssetAmounts_: [minIncomingAssetAmount],
    });
  });
});
