import { randomAddress } from '@enzymefinance/ethers';
import type { CompoundAdapter, ComptrollerLib, VaultLib } from '@enzymefinance/protocol';
import {
  compoundArgs,
  ITestCERC20,
  ITestCompoundComptroller,
  ITestStandardToken,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  assertCompoundLend,
  assertCompoundRedeem,
  compoundClaim,
  createNewFund,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
import { utils } from 'ethers';

let compoundAdapter: CompoundAdapter;
let comptrollerProxy: ComptrollerLib;
let fork: ProtocolDeployment;
let fundOwner: SignerWithAddress;
let vaultProxy: VaultLib;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [fundOwner] = fork.accounts;
  compoundAdapter = fork.deployment.compoundAdapter;
  const newFund = await createNewFund({
    denominationAsset: new ITestStandardToken(fork.config.weth, provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });
  comptrollerProxy = newFund.comptrollerProxy;
  vaultProxy = newFund.vaultProxy;
});

describe('constructor', () => {
  it('sets state vars', async () => {
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
    const args = compoundArgs({
      cToken: fork.config.compoundV2.ctokens.ccomp,
      minIncomingAssetAmount: utils.parseEther('1'),
      outgoingAssetAmount: utils.parseEther('1'),
    });

    await expect(
      compoundAdapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), args),
    ).rejects.toBeRevertedWith('_selector invalid');

    await expect(compoundAdapter.parseAssetsForAction(randomAddress(), lendSelector, args)).resolves.toBeTruthy();
  });

  it('does not allow a bad cToken', async () => {
    const badArgs = compoundArgs({
      cToken: randomAddress(),
      minIncomingAssetAmount: utils.parseEther('1'),
      outgoingAssetAmount: utils.parseEther('1'),
    });

    const goodArgs = compoundArgs({
      cToken: fork.config.compoundV2.ctokens.ccomp,
      minIncomingAssetAmount: utils.parseEther('1'),
      outgoingAssetAmount: utils.parseEther('1'),
    });

    await expect(compoundAdapter.parseAssetsForAction(randomAddress(), lendSelector, badArgs)).rejects.toBeRevertedWith(
      'Unsupported cToken',
    );

    await expect(compoundAdapter.parseAssetsForAction(randomAddress(), lendSelector, goodArgs)).resolves.toBeTruthy();
  });

  it('generates expected output for lending', async () => {
    const cToken = fork.config.compoundV2.ctokens.ccomp;
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
    const cToken = fork.config.compoundV2.ctokens.ccomp;
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
    const lendReceipt = await assertCompoundLend({
      cToken: new ITestCERC20(fork.config.compoundV2.ctokens.cdai, provider),
      compoundAdapter: fork.deployment.compoundAdapter,
      compoundPriceFeed: fork.deployment.compoundPriceFeed,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      provider,
      tokenAmount: utils.parseEther('1'),
      vaultProxy,
    });

    expect(lendReceipt).toMatchInlineGasSnapshot(`442935`);
  });

  it('works as expected when called for lending by a fund (ETH)', async () => {
    const lendReceipt = await assertCompoundLend({
      cToken: new ITestCERC20(fork.config.compoundV2.ceth, provider),
      compoundAdapter: fork.deployment.compoundAdapter,
      compoundPriceFeed: fork.deployment.compoundPriceFeed,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      provider,
      tokenAmount: utils.parseEther('1'),
      vaultProxy,
    });

    expect(lendReceipt).toMatchInlineGasSnapshot(`391562`);
  });
});

describe('redeem', () => {
  it('works as expected when called for redeeming by a fund', async () => {
    const redeemReceipt = await assertCompoundRedeem({
      cToken: new ITestCERC20(fork.config.compoundV2.ctokens.cdai, provider),
      compoundAdapter: fork.deployment.compoundAdapter,
      compoundPriceFeed: fork.deployment.compoundPriceFeed,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      provider,
      vaultProxy,
    });

    expect(redeemReceipt).toMatchInlineGasSnapshot(`411524`);
  });

  it('works as expected when called for redeeming by a fund (ETH)', async () => {
    const redeemReceipt = await assertCompoundRedeem({
      cToken: new ITestCERC20(fork.config.compoundV2.ceth, provider),
      compoundAdapter: fork.deployment.compoundAdapter,
      compoundPriceFeed: fork.deployment.compoundPriceFeed,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      provider,
      vaultProxy,
    });

    expect(redeemReceipt).toMatchInlineGasSnapshot(`316220`);
  });
});

describe('claimComp', () => {
  it('should accrue COMP on the fund after lending', async () => {
    const compoundComptroller = new ITestCompoundComptroller(fork.config.compoundV2.comptroller, fork.deployer);
    const comp = new ITestStandardToken(fork.config.primitives.comp, provider);

    await assertCompoundLend({
      cToken: new ITestCERC20(fork.config.compoundV2.ctokens.cdai, provider),
      compoundAdapter,
      compoundPriceFeed: fork.deployment.compoundPriceFeed,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      provider,
      tokenAmount: utils.parseEther('1'),
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
    const comp = new ITestStandardToken(fork.config.primitives.comp, provider);

    await assertCompoundLend({
      cToken: new ITestCERC20(fork.config.compoundV2.ctokens.cdai, provider),
      compoundAdapter,
      compoundPriceFeed: fork.deployment.compoundPriceFeed,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      provider,
      tokenAmount: utils.parseEther('1'),
      vaultProxy,
    });

    const secondsToWarp = 100000000;

    await provider.send('evm_increaseTime', [secondsToWarp]);
    await provider.send('evm_mine', []);

    await compoundClaim({
      cTokens: [fork.config.compoundV2.ctokens.cdai],
      compoundAdapter,
      compoundComptroller: fork.config.compoundV2.comptroller,
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
