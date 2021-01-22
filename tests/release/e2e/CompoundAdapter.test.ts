import { SignerWithAddress } from '@crestproject/crestproject';
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
  ForkDeployment,
  getAssetBalances,
  ICompoundComptroller,
  loadForkDeployment,
  mainnetWhales,
  unlockWhales,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';
import hre from 'hardhat';

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

  const token = new StandardToken(await compoundPriceFeed.getTokenFromCToken.args(cToken).call(), hre.ethers.provider);
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
const gasAssertionTolerance = 0.03; // 3%
let fork: ForkDeployment;
const whales: Record<string, SignerWithAddress> = {};

beforeAll(async () => {
  // Assign signers for whale accounts
  whales.cdai = ((await hre.ethers.getSigner(mainnetWhales.cdai)) as any) as SignerWithAddress;
  whales.ceth = ((await hre.ethers.getSigner(mainnetWhales.ceth)) as any) as SignerWithAddress;
  whales.dai = ((await hre.ethers.getSigner(mainnetWhales.dai)) as any) as SignerWithAddress;
  whales.weth = ((await hre.ethers.getSigner(mainnetWhales.weth)) as any) as SignerWithAddress;

  await unlockWhales({
    provider: hre.ethers.provider,
    whales: Object.values(whales),
  });
});

beforeEach(async () => {
  fork = await loadForkDeployment();
});

// HAPPY PATHS
describe('lend', () => {
  it('works as expected when called for lending by a fund', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, hre.ethers.provider),
    });

    const lendReceipt = await assertCompoundLend({
      tokenWhale: whales.dai,
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      compoundAdapter: fork.deployment.CompoundAdapter,
      tokenAmount: utils.parseEther('1'),
      cToken: new ICERC20(fork.config.compound.ctokens.cdai, hre.ethers.provider),
      compoundPriceFeed: fork.deployment.CompoundPriceFeed,
    });

    // Rounding up from 398734
    expect(lendReceipt).toCostLessThan('399000', gasAssertionTolerance);
  });

  it('works as expected when called for lending by a fund (ETH)', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, hre.ethers.provider),
    });

    const lendReceipt = await assertCompoundLend({
      tokenWhale: whales.weth,
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      compoundAdapter: fork.deployment.CompoundAdapter,
      tokenAmount: utils.parseEther('1'),
      cToken: new ICERC20(fork.config.compound.ceth, hre.ethers.provider),
      compoundPriceFeed: fork.deployment.CompoundPriceFeed,
    });

    // Rounding up from 336442
    expect(lendReceipt).toCostLessThan('337000', gasAssertionTolerance);
  });
});

describe('redeem', () => {
  it('works as expected when called for redeeming by a fund', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, hre.ethers.provider),
    });

    const redeemReceipt = await assertCompoundRedeem({
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      compoundAdapter: fork.deployment.CompoundAdapter,
      cToken: new ICERC20(fork.config.compound.ctokens.cdai, whales.cdai),
      compoundPriceFeed: fork.deployment.CompoundPriceFeed,
    });

    // Rounding up from 410193
    expect(redeemReceipt).toCostLessThan('411000', gasAssertionTolerance);
  });

  it('works as expected when called for redeeming by a fund (ETH)', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, hre.ethers.provider),
    });

    const redeemReceipt = await assertCompoundRedeem({
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      compoundAdapter: fork.deployment.CompoundAdapter,
      cToken: new ICERC20(fork.config.compound.ceth, whales.ceth),
      compoundPriceFeed: fork.deployment.CompoundPriceFeed,
    });

    // Rounding up from 355111
    expect(redeemReceipt).toCostLessThan('356000', gasAssertionTolerance);
  });
});

describe('claimComp', () => {
  it('should accrue COMP on the fund after lending', async () => {
    const [fundOwner] = fork.accounts;
    const compoundAdapter = fork.deployment.CompoundAdapter;
    const compoundComptroller = new ICompoundComptroller(compoundComptrollerAddress, fork.deployer);
    const comp = new StandardToken(fork.config.primitives.comp, hre.ethers.provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, hre.ethers.provider),
    });

    await assertCompoundLend({
      tokenWhale: whales.dai,
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      compoundAdapter,
      tokenAmount: utils.parseEther('1'),
      cToken: new ICERC20(fork.config.compound.ctokens.cdai, hre.ethers.provider),
      compoundPriceFeed: fork.deployment.CompoundPriceFeed,
    });

    const secondsToWarp = 100000000;
    await hre.ethers.provider.send('evm_increaseTime', [secondsToWarp]);
    await hre.ethers.provider.send('evm_mine', []);

    await compoundComptroller.claimComp(vaultProxy.address);
    await compoundComptroller.claimComp(compoundAdapter.address);

    const compVaultBalance = await comp.balanceOf(vaultProxy);
    const compAdapterBalance = await comp.balanceOf(compoundAdapter.address);

    expect(compVaultBalance).toBeGtBigNumber(0);
    expect(compAdapterBalance).toEqBigNumber(0);
  });
});
