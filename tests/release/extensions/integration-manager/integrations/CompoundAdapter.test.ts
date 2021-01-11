import { EthereumTestnetProvider, randomAddress, SignerWithAddress } from '@crestproject/crestproject';
import {
  CompoundAdapter,
  compoundArgs,
  CompoundPriceFeed,
  ComptrollerLib,
  ICERC20,
  IntegrationManager,
  lendSelector,
  MockCTokenIntegratee,
  MockToken,
  redeemSelector,
  SpendAssetsHandleType,
  StandardToken,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  compoundLend,
  compoundRedeem,
  createNewFund,
  defaultTestDeployment,
  getAssetBalances,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

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

  const token = await MockToken.deploy(config.deployer, 'Underlying', 'Mock', 18);
  const cTokenIntegratee = await MockCTokenIntegratee.deploy(
    config.deployer,
    'Mock',
    'MCK',
    18,
    token,
    randomAddress(),
    utils.parseEther('2'),
  );

  const cToken = new ICERC20(cTokenIntegratee, config.deployer);
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

async function assertCompoundLend({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  tokenAmount = utils.parseEther('1'),
  cToken,
  compoundPriceFeed,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  compoundAdapter: CompoundAdapter;
  tokenAmount?: BigNumber;
  cToken: ICERC20;
  compoundPriceFeed: CompoundPriceFeed;
}) {
  const token = new StandardToken(await compoundPriceFeed.getTokenFromCToken.args(cToken).call(), fundOwner);
  await token.transfer(vaultProxy, tokenAmount);

  const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [cToken, token],
  });

  const lendReceipt = await compoundLend({
    comptrollerProxy,
    integrationManager,
    fundOwner,
    compoundAdapter,
    cToken,
    tokenAmount: tokenAmount,
    cTokenAmount: BigNumber.from('1'),
  });

  // Get exchange rate after tx (the rate is updated right after)
  const rate = await cToken.exchangeRateStored();
  const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [cToken, token],
  });

  const expectedCTokenAmount = tokenAmount.mul(utils.parseEther('1')).div(rate);
  expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(expectedCTokenAmount));
  expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(tokenAmount));

  return lendReceipt;
}

async function assertCompoundRedeem({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  cTokenAmount = constants.One,
  cToken,
  compoundPriceFeed,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  compoundAdapter: CompoundAdapter;
  cTokenAmount?: BigNumber;
  cToken: ICERC20;
  compoundPriceFeed: CompoundPriceFeed;
}) {
  const tokenAmount = utils.parseEther('1');
  const token = new StandardToken(await compoundPriceFeed.getTokenFromCToken.args(cToken).call(), fundOwner);
  await token.transfer(vaultProxy, tokenAmount);

  await compoundLend({
    comptrollerProxy,
    integrationManager,
    fundOwner,
    compoundAdapter,
    cToken,
    tokenAmount,
    cTokenAmount,
  });

  const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [token, cToken],
  });

  const rateBefore = await cToken.exchangeRateStored();
  const redeemAmount = preTxOutgoingAssetBalance;

  const minIncomingTokenAmount = redeemAmount.mul(rateBefore).div(rateBefore);

  const redeemReceipt = await compoundRedeem({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    compoundAdapter,
    cToken,
    tokenAmount: minIncomingTokenAmount,
    cTokenAmount: redeemAmount,
  });

  const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [token, cToken],
  });

  // Get exchange rate after tx (the rate is updated right after)
  const rate = await cToken.exchangeRateStored();
  const expectedTokenAmount = redeemAmount.mul(rate).div(utils.parseEther('1'));

  expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(expectedTokenAmount));
  expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(redeemAmount));

  return redeemReceipt;
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

    const args = compoundArgs({
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

    const badArgs = compoundArgs({
      cToken: randomAddress(),
      minIncomingAssetAmount: utils.parseEther('1'),
      outgoingAssetAmount: utils.parseEther('1'),
    });

    const goodArgs = compoundArgs({
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

    const args = compoundArgs({
      cToken,
      outgoingAssetAmount: tokenAmount,
      minIncomingAssetAmount: minIncomingCTokenAmount,
    });
    const selector = lendSelector;

    const result = await compoundAdapter.parseAssetsForMethod(selector, args);

    expect(result).toMatchFunctionOutput(compoundAdapter.parseAssetsForMethod, {
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
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

    const args = compoundArgs({
      cToken,
      outgoingAssetAmount: cTokenAmount,
      minIncomingAssetAmount: minIncomingTokenAmount,
    });
    const selector = redeemSelector;

    const result = await compoundAdapter.parseAssetsForMethod(selector, args);

    expect(result).toMatchFunctionOutput(compoundAdapter.parseAssetsForMethod, {
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      incomingAssets_: [token],
      spendAssets_: [cToken.address],
      spendAssetAmounts_: [cTokenAmount],
      minIncomingAssetAmounts_: [minIncomingTokenAmount],
    });
  });
});

describe('lend', () => {
  it('works as expected when called for lending by a fund', async () => {
    const {
      config: { deployer },
      deployment: {
        integrationManager,
        compoundAdapter,
        compoundPriceFeed,
        compoundTokens: { ccomp },
      },
      fund: { fundOwner, comptrollerProxy, vaultProxy },
    } = await provider.snapshot(snapshot);

    const cToken = new ICERC20(ccomp, deployer);

    await assertCompoundLend({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      compoundAdapter,
      tokenAmount: utils.parseEther('1'),
      cToken,
      compoundPriceFeed,
    });
  });

  it('works as expected when called for lending by a fund (ETH)', async () => {
    const {
      config: { deployer },
      deployment: {
        integrationManager,
        compoundAdapter,
        compoundPriceFeed,
        compoundTokens: { ceth: cTokenAddress },
      },
      fund: { fundOwner, comptrollerProxy, vaultProxy },
    } = await provider.snapshot(snapshot);

    const cToken = new ICERC20(cTokenAddress, deployer);

    await assertCompoundLend({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      compoundAdapter,
      tokenAmount: utils.parseEther('1'),
      cToken,
      compoundPriceFeed,
    });
  });
});

describe('redeem', () => {
  it('works as expected when called for redeeming by a fund', async () => {
    const {
      config: { deployer },
      deployment: {
        integrationManager,
        compoundAdapter,
        compoundPriceFeed,
        compoundTokens: { cdai: cTokenAddress },
      },
      fund: { fundOwner, comptrollerProxy, vaultProxy },
    } = await provider.snapshot(snapshot);

    const cToken = new ICERC20(cTokenAddress, deployer);

    await assertCompoundRedeem({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      compoundAdapter,
      cToken,
      compoundPriceFeed,
    });
  });

  it('works as expected when called for redeeming by a fund (ETH)', async () => {
    const {
      config: { deployer },
      deployment: {
        integrationManager,
        compoundAdapter,
        compoundPriceFeed,
        compoundTokens: { ceth: cTokenAddress },
      },
      fund: { fundOwner, comptrollerProxy, vaultProxy },
    } = await provider.snapshot(snapshot);

    const cToken = new ICERC20(cTokenAddress, deployer);

    await assertCompoundRedeem({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      compoundAdapter,
      cToken,
      compoundPriceFeed,
    });
  });
});
