import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  CompoundAdapter,
  CompoundPriceFeed,
  ComptrollerLib,
  ICERC20,
  IntegrationManager,
  StandardToken,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  compoundLend,
  compoundRedeem,
  createNewFund,
  ProtocolDeployment,
  getAssetBalances,
  ICompoundComptroller,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

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
  const token = new StandardToken(await compoundPriceFeed.getTokenFromCToken.args(cToken).call(), tokenWhale);
  await token.connect(tokenWhale).transfer(vaultProxy, tokenAmount);
  const rateBefore = await cToken.exchangeRateStored.call();

  // Exchange rate stored can have a small deviation from exchangeRateStored
  const minIncomingCTokenAmount = tokenAmount
    .mul(utils.parseEther('1'))
    .div(rateBefore)
    .mul(BigNumber.from('999'))
    .div(BigNumber.from('1000'));

  const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [cToken as any, token],
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
    assets: [cToken as any, token],
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
  cToken,
  compoundPriceFeed,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  compoundAdapter: CompoundAdapter;
  cToken: ICERC20;
  compoundPriceFeed: CompoundPriceFeed;
}) {
  const cTokenAmount = utils.parseUnits('1', await cToken.decimals());
  await cToken.transfer(vaultProxy, cTokenAmount);

  const token = new StandardToken(await compoundPriceFeed.getTokenFromCToken.args(cToken).call(), provider);
  const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [token, cToken as any],
  });

  const rateBefore = await cToken.exchangeRateStored();
  const minIncomingTokenAmount = cTokenAmount.mul(rateBefore).div(utils.parseEther('1'));

  const redeemReceipt = await compoundRedeem({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    compoundAdapter,
    cToken,
    tokenAmount: minIncomingTokenAmount,
    cTokenAmount,
  });

  const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [token, cToken as any],
  });

  // Get exchange rate after tx (the rate is updated right after)
  const rate = await cToken.exchangeRateStored();
  const expectedTokenAmount = cTokenAmount.mul(rate).div(utils.parseEther('1'));

  expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(expectedTokenAmount));
  expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(cTokenAmount));

  return redeemReceipt;
}

const compoundComptrollerAddress = '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

// HAPPY PATHS
describe('lend', () => {
  it('works as expected when called for lending by a fund', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    const lendReceipt = await assertCompoundLend({
      cToken: new ICERC20(fork.config.compound.ctokens.cdai, provider),
      compoundAdapter: fork.deployment.compoundAdapter,
      compoundPriceFeed: fork.deployment.compoundPriceFeed,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      tokenAmount: utils.parseEther('1'),
      tokenWhale: whales.dai,
      vaultProxy,
    });

    expect(lendReceipt).toCostLessThan('528000');
  });

  it('works as expected when called for lending by a fund (ETH)', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const lendReceipt = await assertCompoundLend({
      cToken: new ICERC20(fork.config.compound.ceth, provider),
      compoundAdapter: fork.deployment.compoundAdapter,
      compoundPriceFeed: fork.deployment.compoundPriceFeed,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      tokenAmount: utils.parseEther('1'),
      tokenWhale: whales.weth,
      vaultProxy,
    });

    expect(lendReceipt).toCostLessThan('448000');
  });
});

describe('redeem', () => {
  it('works as expected when called for redeeming by a fund', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    const redeemReceipt = await assertCompoundRedeem({
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      compoundAdapter: fork.deployment.compoundAdapter,
      cToken: new ICERC20(fork.config.compound.ctokens.cdai, whales.cdai),
      compoundPriceFeed: fork.deployment.compoundPriceFeed,
    });

    expect(redeemReceipt).toCostLessThan('487000');
  });

  it('works as expected when called for redeeming by a fund (ETH)', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    const redeemReceipt = await assertCompoundRedeem({
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      compoundAdapter: fork.deployment.compoundAdapter,
      cToken: new ICERC20(fork.config.compound.ceth, whales.ceth),
      compoundPriceFeed: fork.deployment.compoundPriceFeed,
    });

    expect(redeemReceipt).toCostLessThan('402000');
  });
});

describe('claimComp', () => {
  it('should accrue COMP on the fund after lending', async () => {
    const [fundOwner] = fork.accounts;
    const compoundAdapter = fork.deployment.compoundAdapter;
    const compoundComptroller = new ICompoundComptroller(compoundComptrollerAddress, fork.deployer);
    const comp = new StandardToken(fork.config.primitives.comp, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    await assertCompoundLend({
      tokenWhale: whales.dai,
      cToken: new ICERC20(fork.config.compound.ctokens.cdai, provider),
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      compoundAdapter,
      tokenAmount: utils.parseEther('1'),
      compoundPriceFeed: fork.deployment.compoundPriceFeed,
    });

    const secondsToWarp = 100000000;
    await provider.send('evm_increaseTime', [secondsToWarp]);
    await provider.send('evm_mine', []);

    await compoundComptroller.claimComp(vaultProxy.address);
    await compoundComptroller.claimComp(compoundAdapter.address);

    const compVaultBalance = await comp.balanceOf(vaultProxy);
    const compAdapterBalance = await comp.balanceOf(compoundAdapter.address);

    expect(compVaultBalance).toBeGtBigNumber(0);
    expect(compAdapterBalance).toEqBigNumber(0);
  });
});
