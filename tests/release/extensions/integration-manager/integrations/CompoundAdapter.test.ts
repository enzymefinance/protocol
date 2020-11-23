import { EthereumTestnetProvider, randomAddress } from '@crestproject/crestproject';
import { compoundArgs, lendSelector, MockCTokenIntegratee, redeemSelector } from '@melonproject/protocol';
import { createNewFund, defaultTestDeployment } from '@melonproject/testutils';
import { utils } from 'ethers';

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
  const token = randomAddress();
  const cToken = await MockCTokenIntegratee.deploy(
    config.deployer,
    'Mock',
    'MCK',
    18,
    token,
    randomAddress(),
    utils.parseEther('2'),
  );
  await deployment.compoundPriceFeed.addCTokens([cToken]);

  return {
    accounts: remainingAccounts,
    deployment,
    config,
    fund: {
      comptrollerProxy,
      fundOwner,
      vaultProxy,
    },
    mocks: {
      cToken,
      token,
    },
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: {
        compoundAdapter,
        compoundPriceFeed,
        integrationManager,
        tokens: { weth },
      },
    } = await provider.snapshot(snapshot);

    const getCompoundPriceFeedCall = await compoundAdapter.getCompoundPriceFeed();
    expect(getCompoundPriceFeedCall).toMatchAddress(compoundPriceFeed);

    const getIntegrationManagerCall = await compoundAdapter.getIntegrationManager();
    expect(getIntegrationManagerCall).toMatchAddress(integrationManager);

    const getWethTokenCall = await compoundAdapter.getWethToken();
    expect(getWethTokenCall).toMatchAddress(weth);
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const {
      deployment: {
        compoundAdapter,
        compoundTokens: { ccomp: cToken },
      },
    } = await provider.snapshot(snapshot);

    const args = await compoundArgs({
      cToken,
      minIncomingAssetAmount: utils.parseEther('1'),
      outgoingAssetAmount: utils.parseEther('1'),
    });

    await expect(compoundAdapter.parseAssetsForMethod(utils.randomBytes(4), args)).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    await expect(compoundAdapter.parseAssetsForMethod(lendSelector, args)).resolves.toBeTruthy();
  });

  it('does not allow a bad cToken', async () => {
    const {
      deployment: {
        compoundAdapter,
        compoundTokens: { ccomp: cToken },
      },
    } = await provider.snapshot(snapshot);

    const badArgs = await compoundArgs({
      cToken: randomAddress(),
      minIncomingAssetAmount: utils.parseEther('1'),
      outgoingAssetAmount: utils.parseEther('1'),
    });

    const goodArgs = await compoundArgs({
      cToken,
      minIncomingAssetAmount: utils.parseEther('1'),
      outgoingAssetAmount: utils.parseEther('1'),
    });

    await expect(compoundAdapter.parseAssetsForMethod(lendSelector, badArgs)).rejects.toBeRevertedWith(
      'Unsupported cToken',
    );

    await expect(compoundAdapter.parseAssetsForMethod(lendSelector, goodArgs)).resolves.toBeTruthy();
  });

  it('generates expected output for lending', async () => {
    const {
      deployment: { compoundAdapter },
      mocks: { cToken, token },
    } = await provider.snapshot(snapshot);

    const tokenAmount = utils.parseEther('1');
    const minIncomingCTokenAmount = utils.parseEther('2');

    const args = await compoundArgs({
      cToken,
      outgoingAssetAmount: tokenAmount,
      minIncomingAssetAmount: minIncomingCTokenAmount,
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
      incomingAssets_: [cToken.address],
      spendAssets_: [token],
      spendAssetAmounts_: [tokenAmount],
      minIncomingAssetAmounts_: [minIncomingCTokenAmount],
    });
  });

  it('generates expected output for redeeming', async () => {
    const {
      deployment: { compoundAdapter },
      mocks: { cToken, token },
    } = await provider.snapshot(snapshot);

    const cTokenAmount = utils.parseEther('1');
    const minIncomingTokenAmount = utils.parseEther('2');

    const args = await compoundArgs({
      cToken,
      outgoingAssetAmount: cTokenAmount,
      minIncomingAssetAmount: minIncomingTokenAmount,
    });
    const selector = redeemSelector;

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
      incomingAssets_: [token],
      spendAssets_: [cToken.address],
      spendAssetAmounts_: [cTokenAmount],
      minIncomingAssetAmounts_: [minIncomingTokenAmount],
    });
  });
});
