import { EthereumTestnetProvider, SignerWithAddress } from '@crestproject/crestproject';
import {
  CompoundAdapter,
  CompoundPriceFeed,
  ComptrollerLib,
  ICERC20,
  IntegrationManager,
  StandardToken,
  VaultLib,
} from '@melonproject/protocol';
import {
  compoundLend,
  compoundRedeem,
  createNewFund,
  defaultForkDeployment,
  getAssetBalances,
} from '@melonproject/testutils';
import { BigNumber, constants, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
  } = await provider.snapshot(defaultForkDeployment);

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: config.deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: config.tokens.weth,
  });

  return {
    accounts: remainingAccounts,
    deployment,
    config,
    derivatives: {
      cdai: new ICERC20(config.derivatives.compound.cdai, provider),
      ceth: new ICERC20(config.derivatives.compound.ceth, provider),
    },
    fund: {
      comptrollerProxy,
      fundOwner,
      vaultProxy,
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

  const rateBefore = await cToken.exchangeRateStored.call();

  // Exchange rate stored can have a small deviation from exchangeRateStored
  const minIncomingCTokenAmount = tokenAmount
    .mul(utils.parseEther('1'))
    .div(rateBefore)
    .mul(BigNumber.from('999'))
    .div(BigNumber.from('1000'));

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
    cTokenAmount: minIncomingCTokenAmount,
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
  const minIncomingTokenAmount = redeemAmount.mul(utils.parseEther('1')).div(rateBefore);

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

// HAPPY PATHS
describe('lend', () => {
  it('works as expected when called for lending by a fund', async () => {
    const {
      derivatives: { cdai: cToken },
      deployment: { integrationManager, compoundAdapter, compoundPriceFeed },
      fund: { fundOwner, comptrollerProxy, vaultProxy },
    } = await provider.snapshot(snapshot);

    const lendReceipt = await assertCompoundLend({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      compoundAdapter,
      tokenAmount: utils.parseEther('1'),
      cToken,
      compoundPriceFeed,
    });

    // Rounding up from 561758
    expect(lendReceipt).toCostLessThan('562000');
  });

  it('works as expected when called for lending by a fund (ETH)', async () => {
    const {
      derivatives: { ceth: cToken },
      deployment: { integrationManager, compoundAdapter, compoundPriceFeed },
      fund: { fundOwner, comptrollerProxy, vaultProxy },
    } = await provider.snapshot(snapshot);

    const lendReceipt = await assertCompoundLend({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      compoundAdapter,
      tokenAmount: utils.parseEther('1'),
      cToken,
      compoundPriceFeed,
    });

    // Rounding up from 368546
    expect(lendReceipt).toCostLessThan('369000');
  });
});

describe('redeem', () => {
  it('works as expected when called for redeeming by a fund', async () => {
    const {
      derivatives: { cdai: cToken },
      deployment: { integrationManager, compoundAdapter, compoundPriceFeed },
      fund: { fundOwner, comptrollerProxy, vaultProxy },
    } = await provider.snapshot(snapshot);

    const redeemReceipt = await assertCompoundRedeem({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      compoundAdapter,
      cToken,
      compoundPriceFeed,
    });

    // Rounding up from 594224
    expect(redeemReceipt).toCostLessThan('595000');
  });

  it('works as expected when called for redeeming by a fund (ETH)', async () => {
    const {
      derivatives: { ceth: cToken },
      deployment: { integrationManager, compoundAdapter, compoundPriceFeed },
      fund: { fundOwner, comptrollerProxy, vaultProxy },
    } = await provider.snapshot(snapshot);

    const redeemReceipt = await assertCompoundRedeem({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      compoundAdapter,
      cToken,
      compoundPriceFeed,
    });

    // Rounding up from 435237
    expect(redeemReceipt).toCostLessThan('436000');
  });
});
