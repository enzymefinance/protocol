import { randomAddress } from '@enzymefinance/ethers';
import {
  compoundArgs,
  ICERC20,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
  StandardToken,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  assertCompoundLend,
  assertCompoundRedeem,
  compoundClaim,
  createNewFund,
  deployProtocolFixture,
  ICompoundComptroller,
} from '@enzymefinance/testutils';
import { utils } from 'ethers';

const compoundComptrollerAddress = '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const compoundAdapter = fork.deployment.compoundAdapter;

    const getCompoundPriceFeedCall = await compoundAdapter.getCompoundPriceFeed();

    expect(getCompoundPriceFeedCall).toMatchAddress(fork.deployment.compoundPriceFeed);

    const getIntegrationManagerCall = await compoundAdapter.getIntegrationManager();

    expect(getIntegrationManagerCall).toMatchAddress(fork.deployment.integrationManager);

    const getWethTokenCall = await compoundAdapter.getCompoundWethToken();

    expect(getWethTokenCall).toMatchAddress(fork.config.weth);
  });
});

describe('parseAssetsForAction', () => {
  it('does not allow a bad selector', async () => {
    const compoundAdapter = fork.deployment.compoundAdapter;

    const args = compoundArgs({
      cToken: fork.config.compound.ctokens.ccomp,
      minIncomingAssetAmount: utils.parseEther('1'),
      outgoingAssetAmount: utils.parseEther('1'),
    });

    await expect(
      compoundAdapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), args),
    ).rejects.toBeRevertedWith('_selector invalid');

    await expect(compoundAdapter.parseAssetsForAction(randomAddress(), lendSelector, args)).resolves.toBeTruthy();
  });

  it('does not allow a bad cToken', async () => {
    const compoundAdapter = fork.deployment.compoundAdapter;

    const badArgs = compoundArgs({
      cToken: randomAddress(),
      minIncomingAssetAmount: utils.parseEther('1'),
      outgoingAssetAmount: utils.parseEther('1'),
    });

    const goodArgs = compoundArgs({
      cToken: fork.config.compound.ctokens.ccomp,
      minIncomingAssetAmount: utils.parseEther('1'),
      outgoingAssetAmount: utils.parseEther('1'),
    });

    await expect(compoundAdapter.parseAssetsForAction(randomAddress(), lendSelector, badArgs)).rejects.toBeRevertedWith(
      'Unsupported cToken',
    );

    await expect(compoundAdapter.parseAssetsForAction(randomAddress(), lendSelector, goodArgs)).resolves.toBeTruthy();
  });

  it('generates expected output for lending', async () => {
    const compoundAdapter = fork.deployment.compoundAdapter;
    const cToken = fork.config.compound.ctokens.ccomp;
    const token = fork.config.primitives.comp;

    const tokenAmount = utils.parseEther('1');
    const minIncomingCTokenAmount = utils.parseEther('2');

    const args = compoundArgs({
      cToken,
      minIncomingAssetAmount: minIncomingCTokenAmount,
      outgoingAssetAmount: tokenAmount,
    });
    const selector = lendSelector;

    const result = await compoundAdapter.parseAssetsForAction(randomAddress(), selector, args);

    expect(result).toMatchFunctionOutput(compoundAdapter.parseAssetsForAction, {
      incomingAssets_: [cToken],
      minIncomingAssetAmounts_: [minIncomingCTokenAmount],
      spendAssetAmounts_: [tokenAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [token],
    });
  });

  it('generates expected output for redeeming', async () => {
    const compoundAdapter = fork.deployment.compoundAdapter;
    const cToken = fork.config.compound.ctokens.ccomp;
    const token = fork.config.primitives.comp;

    const cTokenAmount = utils.parseEther('1');
    const minIncomingTokenAmount = utils.parseEther('2');

    const args = compoundArgs({
      cToken,
      minIncomingAssetAmount: minIncomingTokenAmount,
      outgoingAssetAmount: cTokenAmount,
    });
    const selector = redeemSelector;

    const result = await compoundAdapter.parseAssetsForAction(randomAddress(), selector, args);

    expect(result).toMatchFunctionOutput(compoundAdapter.parseAssetsForAction, {
      incomingAssets_: [token],
      minIncomingAssetAmounts_: [minIncomingTokenAmount],
      spendAssetAmounts_: [cTokenAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [cToken],
    });
  });
});

describe('lend', () => {
  it('works as expected when called for lending by a fund', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
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

    expect(lendReceipt).toMatchInlineGasSnapshot(`442935`);
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

    expect(lendReceipt).toMatchInlineGasSnapshot(`394108`);
  });
});

describe('redeem', () => {
  it('works as expected when called for redeeming by a fund', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const redeemReceipt = await assertCompoundRedeem({
      cToken: new ICERC20(fork.config.compound.ctokens.cdai, whales.cdai),
      compoundAdapter: fork.deployment.compoundAdapter,
      compoundPriceFeed: fork.deployment.compoundPriceFeed,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      vaultProxy,
    });

    expect(redeemReceipt).toMatchInlineGasSnapshot(`411524`);
  });

  it('works as expected when called for redeeming by a fund (ETH)', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const redeemReceipt = await assertCompoundRedeem({
      cToken: new ICERC20(fork.config.compound.ceth, whales.ceth),
      compoundAdapter: fork.deployment.compoundAdapter,
      compoundPriceFeed: fork.deployment.compoundPriceFeed,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      vaultProxy,
    });

    expect(redeemReceipt).toMatchInlineGasSnapshot(`341452`);
  });
});

describe('claimComp', () => {
  it('should accrue COMP on the fund after lending', async () => {
    const [fundOwner] = fork.accounts;
    const compoundAdapter = fork.deployment.compoundAdapter;
    const compoundComptroller = new ICompoundComptroller(compoundComptrollerAddress, fork.deployer);
    const comp = new StandardToken(fork.config.primitives.comp, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    await assertCompoundLend({
      cToken: new ICERC20(fork.config.compound.ctokens.cdai, provider),
      compoundAdapter,
      compoundPriceFeed: fork.deployment.compoundPriceFeed,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      tokenAmount: utils.parseEther('1'),
      tokenWhale: whales.dai,
      vaultProxy,
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

  it('should accrue COMP on the fund after lending, adapter', async () => {
    const [fundOwner] = fork.accounts;
    const compoundAdapter = fork.deployment.compoundAdapter;
    const comp = new StandardToken(fork.config.primitives.comp, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    await assertCompoundLend({
      cToken: new ICERC20(fork.config.compound.ctokens.cdai, provider),
      compoundAdapter,
      compoundPriceFeed: fork.deployment.compoundPriceFeed,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      tokenAmount: utils.parseEther('1'),
      tokenWhale: whales.dai,
      vaultProxy,
    });

    const secondsToWarp = 100000000;

    await provider.send('evm_increaseTime', [secondsToWarp]);
    await provider.send('evm_mine', []);

    await compoundClaim({
      cTokens: [fork.config.compound.ctokens.cdai],
      compoundAdapter,
      compoundComptroller: compoundComptrollerAddress,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
    });

    const compVaultBalance = await comp.balanceOf(vaultProxy);
    const compAdapterBalance = await comp.balanceOf(compoundAdapter.address);

    expect(compVaultBalance).toBeGtBigNumber(0);
    expect(compAdapterBalance).toEqBigNumber(0);
  });
});
