import { randomAddress } from '@enzymefinance/ethers';
import {
  ITestStandardToken,
  ITestYearnVaultV2,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
  yearnVaultV2LendArgs,
  yearnVaultV2RedeemArgs,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  getAssetUnit,
  setAccountBalance,
  yearnVaultV2Lend,
  yearnVaultV2Redeem,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

let fork: ProtocolDeployment;
let userAddress: SignerWithAddress;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [userAddress] = fork.accounts;
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const yearnVaultV2Adapter = fork.deployment.yearnVaultV2Adapter;

    expect(await yearnVaultV2Adapter.getYearnVaultV2PriceFeed()).toMatchAddress(fork.deployment.yearnVaultV2PriceFeed);

    // AdapterBase
    expect(await yearnVaultV2Adapter.getIntegrationManager()).toMatchAddress(fork.deployment.integrationManager);
  });
});

describe('parseAssetsForAction', () => {
  it('does not allow a bad selector', async () => {
    await expect(
      fork.deployment.yearnVaultV2Adapter.parseAssetsForAction(
        randomAddress(),
        utils.randomBytes(4),
        constants.HashZero,
      ),
    ).rejects.toBeRevertedWith('_selector invalid');
  });

  describe('lend', () => {
    it('does not allow an invalid yVault', async () => {
      await expect(
        fork.deployment.yearnVaultV2Adapter.parseAssetsForAction(
          randomAddress(),
          lendSelector,
          yearnVaultV2LendArgs({
            minIncomingYVaultSharesAmount: BigNumber.from(1),
            outgoingUnderlyingAmount: BigNumber.from(1),
            yVault: randomAddress(),
          }),
        ),
      ).rejects.toBeReverted();
    });

    it('generates expected output', async () => {
      const yearnVaultV2Adapter = fork.deployment.yearnVaultV2Adapter;

      const yVault = new ITestYearnVaultV2(fork.config.yearn.vaultV2.yVaults.yUsdc, provider);
      const outgoingUnderlyingAmount = utils.parseEther('2');
      const minIncomingYVaultSharesAmount = utils.parseEther('3');

      const result = await yearnVaultV2Adapter.parseAssetsForAction(
        randomAddress(),
        lendSelector,
        yearnVaultV2LendArgs({
          minIncomingYVaultSharesAmount,
          outgoingUnderlyingAmount,
          yVault,
        }),
      );

      expect(result).toMatchFunctionOutput(yearnVaultV2Adapter.parseAssetsForAction, {
        incomingAssets_: [yVault],
        minIncomingAssetAmounts_: [minIncomingYVaultSharesAmount],
        spendAssetAmounts_: [outgoingUnderlyingAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [await yVault.token()],
      });
    });
  });

  describe('redeem', () => {
    it('does not allow an invalid yVault', async () => {
      await expect(
        fork.deployment.yearnVaultV2Adapter.parseAssetsForAction(
          randomAddress(),
          redeemSelector,
          yearnVaultV2RedeemArgs({
            maxOutgoingYVaultSharesAmount: BigNumber.from(1),
            minIncomingUnderlyingAmount: BigNumber.from(1),
            slippageToleranceBps: 1,
            yVault: randomAddress(),
          }),
        ),
      ).rejects.toBeReverted();
    });

    it('generates expected output', async () => {
      const yearnVaultV2Adapter = fork.deployment.yearnVaultV2Adapter;

      const yVault = new ITestYearnVaultV2(fork.config.yearn.vaultV2.yVaults.yUsdc, provider);
      const maxOutgoingYVaultSharesAmount = utils.parseEther('2');
      const minIncomingUnderlyingAmount = utils.parseEther('3');

      const result = await yearnVaultV2Adapter.parseAssetsForAction(
        randomAddress(),
        redeemSelector,
        yearnVaultV2RedeemArgs({
          maxOutgoingYVaultSharesAmount,
          minIncomingUnderlyingAmount,
          slippageToleranceBps: 2,
          yVault,
        }),
      );

      expect(result).toMatchFunctionOutput(yearnVaultV2Adapter.parseAssetsForAction, {
        incomingAssets_: [await yVault.token()],
        minIncomingAssetAmounts_: [minIncomingUnderlyingAmount],
        spendAssetAmounts_: [maxOutgoingYVaultSharesAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [yVault],
      });
    });
  });
});

describe('lend', () => {
  it('works as expected when called for lending by a fund', async () => {
    const yearnVaultV2Adapter = fork.deployment.yearnVaultV2Adapter;
    const [fundOwner] = fork.accounts;
    const yVault = new ITestStandardToken(fork.config.yearn.vaultV2.yVaults.yUsdc, provider);
    const usdc = new ITestStandardToken(fork.config.primitives.usdc, provider);
    const outgoingToken = usdc;
    const assetUnit = await getAssetUnit(yVault);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: usdc,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed the fund with more than the necessary amount of outgoing asset
    const outgoingUnderlyingAmount = assetUnit;
    await setAccountBalance({
      account: vaultProxy,
      amount: outgoingUnderlyingAmount.mul(3),
      provider,
      token: outgoingToken,
    });

    // Since we can't easily test that an unused underlying amount from a deposit is returned
    // / to the vaultProxy, we seed the adapter with a small amount of the underlying, which will
    // / be returned to the vaultProxy upon running lend()
    const preTxAdapterUnderlyingBalance = assetUnit;

    await setAccountBalance({
      account: yearnVaultV2Adapter,
      amount: preTxAdapterUnderlyingBalance,
      provider,
      token: outgoingToken,
    });

    const [preTxYVaultBalance, preTxUnderlyingBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [yVault, outgoingToken],
    });

    expect(preTxYVaultBalance).toEqBigNumber(0);

    const lendReceipt = await yearnVaultV2Lend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      outgoingUnderlyingAmount,
      signer: fundOwner,
      yVault,
      yearnVaultV2Adapter,
    });

    const [postTxYVaultBalance, postTxUnderlyingBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [yVault, outgoingToken],
    });

    // TODO: assert real incoming asset amount
    expect(postTxYVaultBalance).toBeGtBigNumber(0);
    // Includes the underlying amount initially in the adapter
    expect(postTxUnderlyingBalance).toEqBigNumber(
      preTxUnderlyingBalance.sub(outgoingUnderlyingAmount).add(preTxAdapterUnderlyingBalance),
    );

    expect(lendReceipt).toMatchInlineGasSnapshot(`311718`);
  });
});

describe('redeem', () => {
  it('works as expected when called for redeem by a fund', async () => {
    const [fundOwner] = fork.accounts;
    const integrationManager = fork.deployment.integrationManager;
    const yearnVaultV2Adapter = fork.deployment.yearnVaultV2Adapter;
    const yVault = new ITestStandardToken(fork.config.yearn.vaultV2.yVaults.yUsdc, provider);
    const yVaultContract = new ITestYearnVaultV2(yVault, provider);
    const usdc = new ITestStandardToken(fork.config.primitives.usdc, provider);
    const token = usdc;
    const assetUnit = await getAssetUnit(token);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: usdc,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed the fund and acquire yVault shares while leaving some underlying in the vault
    const seedUnderlyingAmount = assetUnit.mul(4);

    await setAccountBalance({ account: vaultProxy, amount: seedUnderlyingAmount, provider, token });
    await yearnVaultV2Lend({
      comptrollerProxy,
      integrationManager,
      outgoingUnderlyingAmount: seedUnderlyingAmount.div(2),
      signer: fundOwner,
      yVault,
      yearnVaultV2Adapter,
    });

    // Since we can't easily test that unused shares are returned to the vaultProxy,
    // seed the adapter with a small amount of yVault shares, which will be returned to
    // the vaultProxy upon running redeem()
    const adapterSeedAmount = assetUnit.div(11);
    await setAccountBalance({ account: userAddress, amount: adapterSeedAmount, provider, token });
    await token.connect(userAddress).approve(yVaultContract, adapterSeedAmount);
    await yVaultContract.connect(userAddress).deposit(adapterSeedAmount, yearnVaultV2Adapter);

    const preTxAdapterYVaultBalance = await yVault.balanceOf(yearnVaultV2Adapter);
    expect(preTxAdapterYVaultBalance).toBeGtBigNumber(0);

    const [preTxUnderlyingBalance, preTxYVaultBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [token, yVault],
    });

    expect(preTxYVaultBalance).toBeGtBigNumber(0);

    // Define redeem args
    const maxOutgoingYVaultSharesAmount = preTxYVaultBalance.div(4);
    const slippageToleranceBps = 5;

    const redeemReceipt = await yearnVaultV2Redeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      maxOutgoingYVaultSharesAmount,
      signer: fundOwner,
      slippageToleranceBps,
      yVault,
      yearnVaultV2Adapter: fork.deployment.yearnVaultV2Adapter,
    });

    const [postTxUnderlyingBalance, postTxYVaultBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [token, yVault],
    });

    // Includes the yVault shares initially in the adapter
    expect(postTxYVaultBalance).toEqBigNumber(
      preTxYVaultBalance.sub(maxOutgoingYVaultSharesAmount).add(preTxAdapterYVaultBalance),
    );
    // TODO: assert real outgoing asset amount
    expect(postTxUnderlyingBalance).toBeGtBigNumber(preTxUnderlyingBalance);

    // Assert that yearn contract was called with expected slippage value
    expect(yVaultContract.withdraw).toHaveBeenCalledOnContractWith(
      maxOutgoingYVaultSharesAmount,
      vaultProxy,
      slippageToleranceBps,
    );

    expect(redeemReceipt).toMatchInlineGasSnapshot(`203924`);
  });
});
