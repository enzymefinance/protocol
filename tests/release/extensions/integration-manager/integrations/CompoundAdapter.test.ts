import { randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  CompoundAdapter,
  compoundArgs,
  CompoundPriceFeed,
  ComptrollerLib,
  ICERC20,
  IntegrationManager,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
  StandardToken,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  compoundLend,
  compoundRedeem,
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

async function snapshot() {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployer,
    deployment,
    config,
  } = await deployProtocolFixture();

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: new StandardToken(config.weth, deployer),
  });

  return {
    accounts: remainingAccounts,
    deployer,
    deployment,
    config,
    fund: {
      comptrollerProxy,
      fundOwner,
      vaultProxy,
    },
  };
}

async function assertCompoundLend({
  tokenWhale,
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  tokenAmount = utils.parseEther('1'),
  cToken,
  compoundPriceFeed,
}: {
  tokenWhale: SignerWithAddress;
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
  await token.connect(tokenWhale).transfer(vaultProxy, tokenAmount);

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
  tokenWhale,
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  cTokenAmount = constants.One,
  cToken,
  compoundPriceFeed,
}: {
  tokenWhale: SignerWithAddress;
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
  await token.connect(tokenWhale).transfer(vaultProxy, tokenAmount);

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
      config: { weth },
      deployment: { compoundAdapter, compoundPriceFeed, integrationManager },
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
      config: {
        compound: {
          ctokens: { ccomp: cToken },
        },
      },
      deployment: { compoundAdapter },
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
      config: {
        compound: {
          ctokens: { ccomp: cToken },
        },
      },
      deployment: { compoundAdapter },
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
      config: {
        primitives: { comp: token },
        compound: {
          ctokens: { ccomp: cToken },
        },
      },
      deployment: { compoundAdapter },
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
      incomingAssets_: [cToken],
      spendAssets_: [token],
      spendAssetAmounts_: [tokenAmount],
      minIncomingAssetAmounts_: [minIncomingCTokenAmount],
    });
  });

  it('generates expected output for redeeming', async () => {
    const {
      config: {
        primitives: { comp: token },
        compound: {
          ctokens: { ccomp: cToken },
        },
      },
      deployment: { compoundAdapter },
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
      spendAssets_: [cToken],
      spendAssetAmounts_: [cTokenAmount],
      minIncomingAssetAmounts_: [minIncomingTokenAmount],
    });
  });
});

describe('lend', () => {
  it('works as expected when called for lending by a fund', async () => {
    const {
      config: {
        compound: {
          ctokens: { ccomp },
        },
      },
      deployment: { integrationManager, compoundAdapter, compoundPriceFeed },
      fund: { fundOwner, comptrollerProxy, vaultProxy },
    } = await provider.snapshot(snapshot);

    const cToken = new ICERC20(ccomp, provider);

    await assertCompoundLend({
      tokenWhale: whales.comp,
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
      config: {
        compound: { ceth: cTokenAddress },
      },
      deployment: { integrationManager, compoundAdapter, compoundPriceFeed },
      fund: { fundOwner, comptrollerProxy, vaultProxy },
    } = await provider.snapshot(snapshot);

    const cToken = new ICERC20(cTokenAddress, provider);

    await assertCompoundLend({
      tokenWhale: whales.weth,
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
      config: {
        compound: {
          ctokens: { cdai: cTokenAddress },
        },
      },
      deployment: { integrationManager, compoundAdapter, compoundPriceFeed },
      fund: { fundOwner, comptrollerProxy, vaultProxy },
    } = await provider.snapshot(snapshot);

    const cToken = new ICERC20(cTokenAddress, provider);

    await assertCompoundRedeem({
      tokenWhale: whales.dai,
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
      config: {
        compound: { ceth: cTokenAddress },
      },
      deployment: { integrationManager, compoundAdapter, compoundPriceFeed },
      fund: { fundOwner, comptrollerProxy, vaultProxy },
    } = await provider.snapshot(snapshot);

    const cToken = new ICERC20(cTokenAddress, provider);

    await assertCompoundRedeem({
      tokenWhale: whales.weth,
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
