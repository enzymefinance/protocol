import {
  EthereumTestnetProvider,
  resolveAddress,
} from '@crestproject/crestproject';
import {
  CompoundAdapter,
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
import { BigNumber, constants, Signer, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await provider.snapshot(
    defaultForkDeployment,
  );

  const [fundOwner, ...remainingAccounts] = accounts;

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
      cdai: new ICERC20(
        await resolveAddress(config.derivatives.compound.cdai),
        provider,
      ),
      ceth: new ICERC20(
        await resolveAddress(config.derivatives.compound.ceth),
        provider,
      ),
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
  token,
  tokenAmount = utils.parseEther('1'),
  cToken,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: Signer;
  compoundAdapter: CompoundAdapter;
  token: StandardToken;
  tokenAmount?: BigNumber;
  cToken: ICERC20;
}) {
  await token.transfer(vaultProxy, tokenAmount);

  const rateBefore = await cToken.exchangeRateStored.call();

  // Exchange rate stored can have a small deviation from exchangeRateStored
  const minIncomingCTokenAmount = tokenAmount
    .mul(utils.parseEther('1'))
    .div(rateBefore)
    .mul(BigNumber.from('999'))
    .div(BigNumber.from('1000'));

  const [
    preTxIncomingAssetBalance,
    preTxOutgoingAssetBalance,
  ] = await getAssetBalances({
    account: vaultProxy,
    assets: [cToken, token],
  });

  const txLend = compoundLend({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    compoundAdapter,
    token,
    cToken,
    tokenAmount: tokenAmount,
    cTokenAmount: minIncomingCTokenAmount,
    seedFund: false,
  });
  await expect(txLend).resolves.toBeTruthy();

  // Get exchange rate after tx (the rate is updated right after)
  const rate = await cToken.exchangeRateStored();

  const [
    postTxIncomingAssetBalance,
    postTxOutgoingAssetBalance,
  ] = await getAssetBalances({
    account: vaultProxy,
    assets: [cToken, token],
  });

  const expectedCTokenAmount = tokenAmount.mul(utils.parseEther('1')).div(rate);

  expect(postTxIncomingAssetBalance).toEqBigNumber(
    preTxIncomingAssetBalance.add(expectedCTokenAmount),
  );
  expect(postTxOutgoingAssetBalance).toEqBigNumber(
    preTxOutgoingAssetBalance.sub(tokenAmount),
  );
}

async function assertCompoundRedeem({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  token,
  cToken,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: Signer;
  compoundAdapter: CompoundAdapter;
  token: StandardToken;
  tokenAmount?: BigNumber;
  cToken: ICERC20;
}) {
  await compoundLend({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    compoundAdapter,
    token,
    cToken,
    tokenAmount: utils.parseEther('1'),
    cTokenAmount: constants.One,
    seedFund: true,
  });

  const [
    preTxIncomingAssetBalance,
    preTxOutgoingAssetBalance,
  ] = await getAssetBalances({
    account: vaultProxy,
    assets: [token, cToken],
  });
  const rateBefore = await cToken.exchangeRateStored();
  const redeemAmount = preTxOutgoingAssetBalance;
  const minIncomingTokenAmount = redeemAmount
    .mul(utils.parseEther('1'))
    .div(rateBefore);

  const txRedeem = compoundRedeem({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    compoundAdapter,
    token,
    cToken,
    tokenAmount: minIncomingTokenAmount,
    cTokenAmount: redeemAmount,
  });

  await expect(txRedeem).resolves.toBeTruthy();

  const [
    postTxIncomingAssetBalance,
    postTxOutgoingAssetBalance,
  ] = await getAssetBalances({
    account: vaultProxy,
    assets: [token, cToken],
  });

  // Get exchange rate after tx (the rate is updated right after)
  const rate = await cToken.exchangeRateStored();
  const expectedTokenAmount = redeemAmount.mul(rate).div(utils.parseEther('1'));

  expect(postTxIncomingAssetBalance).toEqBigNumber(
    preTxIncomingAssetBalance.add(expectedTokenAmount),
  );

  expect(postTxOutgoingAssetBalance).toEqBigNumber(
    preTxOutgoingAssetBalance.sub(redeemAmount),
  );
}

// HAPPY PATHS
it('works as expected when called for lending by a fund', async () => {
  const {
    derivatives: { cdai: cToken },
    config: {
      tokens: { dai: token },
    },
    deployment: { integrationManager, compoundAdapter },
    fund: { fundOwner, comptrollerProxy, vaultProxy },
  } = await provider.snapshot(snapshot);

  await assertCompoundLend({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    compoundAdapter,
    token,
    tokenAmount: utils.parseEther('1'),
    cToken: cToken,
  });
});

it('works as expected when called for lending by a fund (ETH)', async () => {
  const {
    derivatives: { ceth: cToken },
    config: {
      tokens: { weth: token },
    },
    deployment: { integrationManager, compoundAdapter },
    fund: { fundOwner, comptrollerProxy, vaultProxy },
  } = await provider.snapshot(snapshot);

  await assertCompoundLend({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    compoundAdapter,
    token,
    tokenAmount: utils.parseEther('1'),
    cToken: cToken,
  });
});

it('works as expected when called for redeeming by a fund', async () => {
  const {
    derivatives: { cdai: cToken },
    config: {
      tokens: { dai: token },
    },
    deployment: { integrationManager, compoundAdapter },
    fund: { fundOwner, comptrollerProxy, vaultProxy },
  } = await provider.snapshot(snapshot);

  await assertCompoundRedeem({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    compoundAdapter,
    token,
    cToken: cToken,
  });
});

it('works as expected when called for redeeming by a fund (ETH)', async () => {
  const {
    derivatives: { ceth: cToken },
    config: {
      tokens: { weth: token },
    },
    deployment: { integrationManager, compoundAdapter },
    fund: { fundOwner, comptrollerProxy, vaultProxy },
  } = await provider.snapshot(snapshot);

  await assertCompoundRedeem({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    compoundAdapter,
    token,
    cToken: cToken,
  });
});

// UNHAPPY PATHS
