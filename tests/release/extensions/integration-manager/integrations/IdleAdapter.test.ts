import { randomAddress } from '@enzymefinance/ethers';
import {
  claimRewardsSelector,
  idleClaimRewardsArgs,
  idleLendArgs,
  idleRedeemArgs,
  IIdleTokenV4,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
  StandardToken,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  idleClaimRewards,
  idleLend,
  idleRedeem,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const idleAdapter = fork.deployment.idleAdapter;

    expect(await idleAdapter.getIdlePriceFeed()).toMatchAddress(fork.deployment.idlePriceFeed);

    // AdapterBase
    expect(await idleAdapter.getIntegrationManager()).toMatchAddress(fork.deployment.integrationManager);
  });
});

describe('parseAssetsForAction', () => {
  it('does not allow a bad selector', async () => {
    await expect(
      fork.deployment.idleAdapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), constants.HashZero),
    ).rejects.toBeRevertedWith('_selector invalid');
  });

  describe('claimRewards', () => {
    it('does not allow an invalid idleToken', async () => {
      const [fundOwner] = fork.accounts;

      // Create fund to have a valid vaultProxy
      const { vaultProxy } = await createNewFund({
        denominationAsset: new StandardToken(fork.config.weth, fundOwner),
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner,
        signer: fundOwner,
      });

      await expect(
        fork.deployment.idleAdapter.parseAssetsForAction(
          vaultProxy,
          claimRewardsSelector,
          idleClaimRewardsArgs({
            idleToken: randomAddress(),
          }),
        ),
      ).rejects.toBeReverted();
    });

    // TODO: refactor with a mock?
    it('generates expected output', async () => {
      const [fundOwner] = fork.accounts;
      const idleAdapter = fork.deployment.idleAdapter;
      const idleToken = new StandardToken(fork.config.idle.bestYieldIdleDai, provider);
      const underlying = new StandardToken(fork.config.primitives.dai, whales.dai);

      // Create fund and acquire idleTokens
      const { comptrollerProxy, vaultProxy } = await createNewFund({
        denominationAsset: new StandardToken(fork.config.weth, fundOwner),
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner,
        signer: fundOwner,
      });
      const outgoingUnderlyingAmount = utils.parseUnits('1', await underlying.decimals());

      await underlying.transfer(vaultProxy, outgoingUnderlyingAmount);
      await idleLend({
        comptrollerProxy,
        fundOwner,
        idleAdapter,
        idleToken,
        integrationManager: fork.deployment.integrationManager,
        outgoingUnderlyingAmount,
      });

      const result = await idleAdapter.parseAssetsForAction(
        vaultProxy,
        claimRewardsSelector,
        idleClaimRewardsArgs({ idleToken }),
      );

      expect(result).toMatchFunctionOutput(idleAdapter.parseAssetsForAction, {
        incomingAssets_: [],
        minIncomingAssetAmounts_: [],
        spendAssetAmounts_: [await idleToken.balanceOf(vaultProxy)],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [idleToken],
      });
    });
  });

  describe('lend', () => {
    it('does not allow an invalid idleToken', async () => {
      await expect(
        fork.deployment.idleAdapter.parseAssetsForAction(
          randomAddress(),
          lendSelector,
          idleLendArgs({
            idleToken: randomAddress(),
            minIncomingIdleTokenAmount: BigNumber.from(1),
            outgoingUnderlyingAmount: BigNumber.from(1),
          }),
        ),
      ).rejects.toBeReverted();
    });

    it('generates expected output', async () => {
      const idleAdapter = fork.deployment.idleAdapter;

      const idleToken = new IIdleTokenV4(fork.config.idle.bestYieldIdleDai, provider);
      const outgoingUnderlyingAmount = utils.parseEther('2');
      const minIncomingIdleTokenAmount = utils.parseEther('3');

      const result = await idleAdapter.parseAssetsForAction(
        randomAddress(),
        lendSelector,
        idleLendArgs({
          idleToken,
          minIncomingIdleTokenAmount,
          outgoingUnderlyingAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(idleAdapter.parseAssetsForAction, {
        incomingAssets_: [idleToken],
        minIncomingAssetAmounts_: [minIncomingIdleTokenAmount],
        spendAssetAmounts_: [outgoingUnderlyingAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [await idleToken.token()],
      });
    });
  });

  describe('redeem', () => {
    it('does not allow an invalid idleToken', async () => {
      await expect(
        fork.deployment.idleAdapter.parseAssetsForAction(
          randomAddress(),
          redeemSelector,
          idleRedeemArgs({
            idleToken: randomAddress(),
            minIncomingUnderlyingAmount: BigNumber.from(1),
            outgoingIdleTokenAmount: BigNumber.from(1),
          }),
        ),
      ).rejects.toBeReverted();
    });

    it('generates expected output', async () => {
      const idleAdapter = fork.deployment.idleAdapter;

      const idleToken = new IIdleTokenV4(fork.config.idle.bestYieldIdleDai, provider);
      const outgoingIdleTokenAmount = utils.parseEther('2');
      const minIncomingUnderlyingAmount = utils.parseEther('3');

      const result = await idleAdapter.parseAssetsForAction(
        randomAddress(),
        redeemSelector,
        idleRedeemArgs({
          idleToken,
          minIncomingUnderlyingAmount,
          outgoingIdleTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(idleAdapter.parseAssetsForAction, {
        incomingAssets_: [await idleToken.token()],
        minIncomingAssetAmounts_: [minIncomingUnderlyingAmount],
        spendAssetAmounts_: [outgoingIdleTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [idleToken],
      });
    });
  });
});

describe('claimRewards', () => {
  it('claims all rewards due, and all involved assets end in the vault', async () => {
    const [fundOwner] = fork.accounts;
    const integrationManager = fork.deployment.integrationManager;
    const idleAdapter = fork.deployment.idleAdapter;
    const idleToken = new IIdleTokenV4(fork.config.idle.bestYieldIdleDai, provider);
    const idleTokenERC20 = new StandardToken(fork.config.idle.bestYieldIdleDai, provider);
    const underlying = new StandardToken(fork.config.primitives.dai, whales.dai);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, fundOwner),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed the fund with idleTokens to start accruing rewards
    const outgoingUnderlyingAmount = utils.parseUnits('1', await idleTokenERC20.decimals());

    await underlying.transfer(vaultProxy, outgoingUnderlyingAmount.mul(2));

    await idleLend({
      comptrollerProxy,
      fundOwner,
      idleAdapter,
      idleToken: idleTokenERC20,
      integrationManager,
      minIncomingIdleTokenAmount: BigNumber.from(1),
      outgoingUnderlyingAmount,
    });

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);
    await provider.send('evm_mine', []);

    const [preTxVaultIdleTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [idleTokenERC20],
    });

    expect(preTxVaultIdleTokenBalance).toBeGtBigNumber(0);

    await idleClaimRewards({
      comptrollerProxy,
      fundOwner,
      idleAdapter,
      idleToken: idleTokenERC20,
      integrationManager,
    });

    const [postTxVaultIdleTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [idleTokenERC20],
    });

    // Assert that the vault has the same initial balance of idleTokens
    expect(postTxVaultIdleTokenBalance).toEqBigNumber(preTxVaultIdleTokenBalance);

    // Assert that the rewards wind up in the VaultProxy
    const govTokensLength = (await idleToken.getGovTokensAmounts(idleAdapter)).length;

    expect(govTokensLength).toBeGreaterThan(0);
    let totalGovTokenVaultBalances = BigNumber.from('0');

    for (const i in await idleToken.getGovTokensAmounts(idleAdapter)) {
      const govToken = new StandardToken(await idleToken.govTokens(i), provider);

      // The adapter should have no reward token balances
      expect(await govToken.balanceOf(idleAdapter)).toEqBigNumber(0);

      totalGovTokenVaultBalances = totalGovTokenVaultBalances.add(await govToken.balanceOf(vaultProxy));
    }

    // Assert the absolute amount of tokens received at the vault is > 0, given that a particular reward could be zero
    expect(totalGovTokenVaultBalances).toBeGtBigNumber(0);
  });
});

describe('lend', () => {
  it('works as expected when called for lending by a fund', async () => {
    const [fundOwner] = fork.accounts;
    const idleToken = new StandardToken(fork.config.idle.bestYieldIdleDai, provider);
    const outgoingToken = new StandardToken(fork.config.primitives.dai, whales.dai);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, fundOwner),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed the fund with more than the necessary amount of outgoing asset
    const outgoingUnderlyingAmount = utils.parseUnits('1', await idleToken.decimals());

    await outgoingToken.transfer(vaultProxy, outgoingUnderlyingAmount.mul(2));

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [idleToken, outgoingToken],
    });

    expect(preTxIncomingAssetBalance).toEqBigNumber(0);

    const lendReceipt = await idleLend({
      comptrollerProxy,
      fundOwner,
      idleAdapter: fork.deployment.idleAdapter,
      idleToken,
      integrationManager: fork.deployment.integrationManager,
      outgoingUnderlyingAmount,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [idleToken, outgoingToken],
    });

    expect(postTxIncomingAssetBalance).toBeGtBigNumber(0);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(outgoingUnderlyingAmount));

    expect(lendReceipt).toCostAround('767460');
  });
});

describe('redeem', () => {
  it('works as expected when called for redeem by a fund', async () => {
    const [fundOwner] = fork.accounts;
    const integrationManager = fork.deployment.integrationManager;
    const idleAdapter = fork.deployment.idleAdapter;
    const idleToken = new IIdleTokenV4(fork.config.idle.bestYieldIdleDai, provider);
    const idleTokenERC20 = new StandardToken(fork.config.idle.bestYieldIdleDai, provider);
    const token = new StandardToken(fork.config.primitives.dai, whales.dai);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, fundOwner),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed the fund with more than the necessary amount of outgoing asset
    const outgoingUnderlyingAmount = utils.parseUnits('1', await idleTokenERC20.decimals());

    await token.transfer(vaultProxy, outgoingUnderlyingAmount.mul(2));

    await idleLend({
      comptrollerProxy,
      fundOwner,
      idleAdapter,
      idleToken: idleTokenERC20,
      integrationManager,
      minIncomingIdleTokenAmount: BigNumber.from(1),
      outgoingUnderlyingAmount,
    });

    const vaultIdleTokenBalance = await idleTokenERC20.balanceOf(vaultProxy);

    expect(vaultIdleTokenBalance).toBeGtBigNumber(0);

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);
    await provider.send('evm_mine', []);

    const [preTxIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [token],
    });

    const redeemReceipt = await idleRedeem({
      comptrollerProxy,
      fundOwner,
      idleAdapter: fork.deployment.idleAdapter,
      idleToken: idleTokenERC20,
      integrationManager: fork.deployment.integrationManager,
      outgoingIdleTokenAmount: vaultIdleTokenBalance,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [token, idleTokenERC20],
    });

    expect(postTxIncomingAssetBalance).toBeGtBigNumber(preTxIncomingAssetBalance);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(0);

    // Assert that the rewards wind up in the VaultProxy
    const govTokensLength = (await idleToken.getGovTokensAmounts(idleAdapter)).length;

    expect(govTokensLength).toBeGreaterThan(0);

    let totalGovTokenVaultBalances = BigNumber.from('0');

    for (const i in await idleToken.getGovTokensAmounts(idleAdapter)) {
      const govToken = new StandardToken(await idleToken.govTokens(i), provider);

      // The adapter should have no reward token balances
      expect(await govToken.balanceOf(idleAdapter)).toEqBigNumber(0);

      totalGovTokenVaultBalances = totalGovTokenVaultBalances.add(await govToken.balanceOf(vaultProxy));
    }

    // Assert the absolute amount of govTokensEarned, since some individual rewards could be 0.
    expect(totalGovTokenVaultBalances).toBeGtBigNumber(0);

    expect(redeemReceipt).toCostAround('692191');
  });
});

describe('rewards behavior', () => {
  it('accrues rewards to the vaultProxy and pays out rewards upon redemption', async () => {
    const [fundOwner, randomIdleTokenCaller] = fork.accounts;
    const idleAdapter = fork.deployment.idleAdapter;
    const idleToken = new IIdleTokenV4(fork.config.idle.bestYieldIdleDai, provider);
    const idleTokenERC20 = new StandardToken(idleToken, provider);
    const outgoingToken = new StandardToken(fork.config.primitives.dai, whales.dai);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, fundOwner),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Lend for idleToken
    const lendAmount = utils.parseUnits('2', await outgoingToken.decimals());

    await outgoingToken.transfer(vaultProxy, lendAmount);
    await idleLend({
      comptrollerProxy,
      fundOwner,
      idleAdapter,
      idleToken: idleTokenERC20,
      integrationManager: fork.deployment.integrationManager,
      outgoingUnderlyingAmount: lendAmount,
    });

    // Call redeem with 0-value from a random user to start rewards estimation
    await idleToken.connect(randomIdleTokenCaller).redeemIdleToken(0);

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);
    await provider.send('evm_mine', []);

    // Rewards should have accrued to the vaultProxy and not to the adapter
    const preRedeemVaultProxyGovTokensEarned = await idleToken.getGovTokensAmounts(vaultProxy);
    let preRedeemTotalVaultProxyGovTokensEarned = BigNumber.from('0');

    // Assert the absolute amount of govTokensEarned, since some individual rewards could be 0.
    for (const amountEarned of preRedeemVaultProxyGovTokensEarned) {
      preRedeemTotalVaultProxyGovTokensEarned = preRedeemTotalVaultProxyGovTokensEarned.add(amountEarned);
    }

    expect(preRedeemTotalVaultProxyGovTokensEarned).toBeGtBigNumber(0);

    const preRedeemAdapterGovTokenEarned = await idleToken.getGovTokensAmounts(idleAdapter);

    for (const amountEarned of preRedeemAdapterGovTokenEarned) {
      expect(amountEarned).toEqBigNumber(0);
    }

    // There is a big inconsistency in the estimation provided by getGovTokensAmounts(),
    // so we need to use most of the idleTokens to leave only a small fraction,
    // in order to test the expected bounds on the remaining gov token amounts unclaimed.
    const redeemAmount = (await idleTokenERC20.balanceOf(vaultProxy)).mul(98).div(100);

    // Redeem partial idle tokens
    await idleRedeem({
      comptrollerProxy,
      fundOwner,
      idleAdapter,
      idleToken: idleTokenERC20,
      integrationManager: fork.deployment.integrationManager,
      outgoingIdleTokenAmount: redeemAmount,
    });

    // The VaultProxy should still have rewards unclaimed
    const postRedeemVaultProxyGovTokensEarned = await idleToken.getGovTokensAmounts(vaultProxy);
    let postRedeemTotalVaultProxyGovTokens = BigNumber.from('0');

    for (const i in postRedeemVaultProxyGovTokensEarned) {
      postRedeemTotalVaultProxyGovTokens = postRedeemTotalVaultProxyGovTokens.add(
        postRedeemVaultProxyGovTokensEarned[i],
      );
      expect(postRedeemVaultProxyGovTokensEarned[i]).toBeLteBigNumber(preRedeemVaultProxyGovTokensEarned[i]);
    }

    // Assert the absolute amount of govTokensEarned, since some individual rewards could be 0.
    expect(postRedeemTotalVaultProxyGovTokens).toBeGtBigNumber(0);

    // The adapter should still have no rewards unclaimed
    const postRedeemAdapterGovTokensEarned = await idleToken.getGovTokensAmounts(idleAdapter);

    for (const amountEarned of postRedeemAdapterGovTokensEarned) {
      expect(amountEarned).toEqBigNumber(0);
    }

    // Assert that the rewards wind up in the VaultProxy
    const govTokensLength = (await idleToken.getGovTokensAmounts(idleAdapter)).length;

    expect(govTokensLength).toBeGreaterThan(0);
    for (const i in await idleToken.getGovTokensAmounts(idleAdapter)) {
      const govToken = new StandardToken(await idleToken.govTokens(i), provider);

      // The adapter should have no reward token balances
      expect(await govToken.balanceOf(idleAdapter)).toEqBigNumber(0);
    }
  });
});
