import { randomAddress } from '@enzymefinance/ethers';
import {
  approveAssetsSelector,
  claimRewardsAndReinvestSelector,
  claimRewardsAndSwapSelector,
  claimRewardsSelector,
  idleApproveAssetsArgs,
  idleClaimRewardsAndReinvestArgs,
  idleClaimRewardsAndSwapArgs,
  idleClaimRewardsArgs,
  idleLendArgs,
  idleRedeemArgs,
  IIdleTokenV4,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
  StandardToken,
} from '@enzymefinance/protocol';
import {
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  idleApproveAssets,
  idleClaimRewards,
  idleClaimRewardsAndReinvest,
  idleClaimRewardsAndSwap,
  idleLend,
  idleRedeem,
  ProtocolDeployment,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

let idleGov: StandardToken;
let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();

  idleGov = new StandardToken('0x875773784af8135ea0ef43b5a374aad105c5d39e', whales.idle);
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const idleAdapter = fork.deployment.idleAdapter;

    expect(await idleAdapter.getIdlePriceFeed()).toMatchAddress(fork.deployment.idlePriceFeed);
    expect(await idleAdapter.getWethToken()).toMatchAddress(fork.config.weth);

    // AdapterBase
    expect(await idleAdapter.getIntegrationManager()).toMatchAddress(fork.deployment.integrationManager);

    // UniswapV2ActionsMixin
    expect(await idleAdapter.getUniswapV2Router2()).toMatchAddress(fork.config.uniswap.router);
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    await expect(
      fork.deployment.idleAdapter.parseAssetsForMethod(utils.randomBytes(4), constants.HashZero),
    ).rejects.toBeRevertedWith('_selector invalid');
  });

  describe('approveAssets', () => {
    it('does not allow an invalid idleToken', async () => {
      await expect(
        fork.deployment.idleAdapter.parseAssetsForMethod(
          approveAssetsSelector,
          idleApproveAssetsArgs({
            idleToken: randomAddress(),
            assets: [randomAddress(), randomAddress()],
            amounts: [1, 2],
          }),
        ),
      ).rejects.toBeReverted();
    });

    it('does not allow unequal input arrays', async () => {
      await expect(
        fork.deployment.idleAdapter.parseAssetsForMethod(
          approveAssetsSelector,
          idleApproveAssetsArgs({
            idleToken: fork.config.idle.bestYieldIdleDai,
            assets: [randomAddress(), randomAddress()],
            amounts: [1],
          }),
        ),
      ).rejects.toBeRevertedWith('Unequal arrays');
    });

    it('does not allow an asset that is not a rewards token (with an amount >0)', async () => {
      await expect(
        fork.deployment.idleAdapter.parseAssetsForMethod(
          approveAssetsSelector,
          idleApproveAssetsArgs({
            idleToken: fork.config.idle.bestYieldIdleDai,
            assets: [randomAddress()],
            amounts: [1],
          }),
        ),
      ).rejects.toBeRevertedWith('Invalid reward token');
    });

    it('generates expected output', async () => {
      const idleAdapter = fork.deployment.idleAdapter;

      // Random address should be allowed since amount is 0
      const assets = [idleGov, randomAddress()];
      const amounts = [1, 0];
      const result = await idleAdapter.parseAssetsForMethod(
        approveAssetsSelector,
        idleApproveAssetsArgs({
          idleToken: fork.config.idle.bestYieldIdleDai,
          assets,
          amounts,
        }),
      );

      expect(result).toMatchFunctionOutput(idleAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Approve,
        spendAssets_: assets,
        spendAssetAmounts_: amounts,
        incomingAssets_: [],
        minIncomingAssetAmounts_: [],
      });
    });
  });

  describe('claimRewards', () => {
    it('does not allow an invalid idleToken', async () => {
      const [fundOwner] = fork.accounts;

      // Create fund to have a valid vaultProxy
      const { vaultProxy } = await createNewFund({
        signer: fundOwner,
        fundOwner,
        fundDeployer: fork.deployment.fundDeployer,
        denominationAsset: new StandardToken(fork.config.weth, fundOwner),
      });

      await expect(
        fork.deployment.idleAdapter.parseAssetsForMethod(
          claimRewardsSelector,
          idleClaimRewardsArgs({
            vaultProxy,
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
        signer: fundOwner,
        fundOwner,
        fundDeployer: fork.deployment.fundDeployer,
        denominationAsset: new StandardToken(fork.config.weth, fundOwner),
      });
      const outgoingUnderlyingAmount = utils.parseUnits('1', await underlying.decimals());
      await underlying.transfer(vaultProxy, outgoingUnderlyingAmount);
      await idleLend({
        comptrollerProxy,
        integrationManager: fork.deployment.integrationManager,
        fundOwner,
        idleAdapter,
        idleToken,
        outgoingUnderlyingAmount,
      });

      const result = await idleAdapter.parseAssetsForMethod(
        claimRewardsSelector,
        idleClaimRewardsArgs({
          vaultProxy,
          idleToken,
        }),
      );

      expect(result).toMatchFunctionOutput(idleAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [idleToken],
        spendAssetAmounts_: [await idleToken.balanceOf(vaultProxy)],
        incomingAssets_: [],
        minIncomingAssetAmounts_: [],
      });
    });
  });

  describe('claimRewardsAndReinvest', () => {
    // TODO: refactor with a mock?
    it('generates expected output', async () => {
      const [fundOwner] = fork.accounts;
      const idleAdapter = fork.deployment.idleAdapter;
      const idleToken = new StandardToken(fork.config.idle.bestYieldIdleDai, provider);
      const underlying = new StandardToken(fork.config.primitives.dai, whales.dai);

      // Create fund and acquire idleTokens
      const { comptrollerProxy, vaultProxy } = await createNewFund({
        signer: fundOwner,
        fundOwner,
        fundDeployer: fork.deployment.fundDeployer,
        denominationAsset: new StandardToken(fork.config.weth, fundOwner),
      });
      const outgoingUnderlyingAmount = utils.parseUnits('1', await underlying.decimals());
      await underlying.transfer(vaultProxy, outgoingUnderlyingAmount);
      await idleLend({
        comptrollerProxy,
        integrationManager: fork.deployment.integrationManager,
        fundOwner,
        idleAdapter,
        idleToken,
        outgoingUnderlyingAmount,
      });

      const minIncomingIdleTokenAmount = utils.parseEther('2');

      const result = await idleAdapter.parseAssetsForMethod(
        claimRewardsAndReinvestSelector,
        idleClaimRewardsAndReinvestArgs({
          vaultProxy,
          idleToken,
          minIncomingIdleTokenAmount,
          useFullBalances: false, // Not relevant here
        }),
      );

      expect(result).toMatchFunctionOutput(idleAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [idleToken],
        spendAssetAmounts_: [await idleToken.balanceOf(vaultProxy)],
        incomingAssets_: [idleToken],
        minIncomingAssetAmounts_: [minIncomingIdleTokenAmount],
      });
    });
  });

  describe('claimRewardsAndSwap', () => {
    it('does not allow an invalid idleToken', async () => {
      const [fundOwner] = fork.accounts;

      // Create fund to have a valid vaultProxy
      const { vaultProxy } = await createNewFund({
        signer: fundOwner,
        fundOwner,
        fundDeployer: fork.deployment.fundDeployer,
        denominationAsset: new StandardToken(fork.config.weth, fundOwner),
      });

      await expect(
        fork.deployment.idleAdapter.parseAssetsForMethod(
          claimRewardsAndSwapSelector,
          idleClaimRewardsAndSwapArgs({
            vaultProxy,
            idleToken: randomAddress(),
            incomingAsset: randomAddress(),
            minIncomingAssetAmount: BigNumber.from(1),
            useFullBalances: false, // Not relevant here
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
        signer: fundOwner,
        fundOwner,
        fundDeployer: fork.deployment.fundDeployer,
        denominationAsset: new StandardToken(fork.config.weth, fundOwner),
      });
      const outgoingUnderlyingAmount = utils.parseUnits('1', await underlying.decimals());
      await underlying.transfer(vaultProxy, outgoingUnderlyingAmount);
      await idleLend({
        comptrollerProxy,
        integrationManager: fork.deployment.integrationManager,
        fundOwner,
        idleAdapter,
        idleToken,
        outgoingUnderlyingAmount,
      });

      const incomingAsset = randomAddress();
      const minIncomingAssetAmount = utils.parseEther('2');

      const result = await idleAdapter.parseAssetsForMethod(
        claimRewardsAndSwapSelector,
        idleClaimRewardsAndSwapArgs({
          vaultProxy,
          idleToken,
          incomingAsset,
          minIncomingAssetAmount,
          useFullBalances: false, // Not relevant here
        }),
      );

      expect(result).toMatchFunctionOutput(idleAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [idleToken],
        spendAssetAmounts_: [await idleToken.balanceOf(vaultProxy)],
        incomingAssets_: [incomingAsset],
        minIncomingAssetAmounts_: [minIncomingAssetAmount],
      });
    });
  });

  describe('lend', () => {
    it('does not allow an invalid idleToken', async () => {
      await expect(
        fork.deployment.idleAdapter.parseAssetsForMethod(
          lendSelector,
          idleLendArgs({
            idleToken: randomAddress(),
            outgoingUnderlyingAmount: BigNumber.from(1),
            minIncomingIdleTokenAmount: BigNumber.from(1),
          }),
        ),
      ).rejects.toBeReverted();
    });

    it('generates expected output', async () => {
      const idleAdapter = fork.deployment.idleAdapter;

      const idleToken = new IIdleTokenV4(fork.config.idle.bestYieldIdleDai, provider);
      const outgoingUnderlyingAmount = utils.parseEther('2');
      const minIncomingIdleTokenAmount = utils.parseEther('3');

      const result = await idleAdapter.parseAssetsForMethod(
        lendSelector,
        idleLendArgs({
          idleToken,
          outgoingUnderlyingAmount,
          minIncomingIdleTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(idleAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [await idleToken.token()],
        spendAssetAmounts_: [outgoingUnderlyingAmount],
        incomingAssets_: [idleToken],
        minIncomingAssetAmounts_: [minIncomingIdleTokenAmount],
      });
    });
  });

  describe('redeem', () => {
    it('does not allow an invalid idleToken', async () => {
      await expect(
        fork.deployment.idleAdapter.parseAssetsForMethod(
          redeemSelector,
          idleRedeemArgs({
            idleToken: randomAddress(),
            outgoingIdleTokenAmount: BigNumber.from(1),
            minIncomingUnderlyingAmount: BigNumber.from(1),
          }),
        ),
      ).rejects.toBeReverted();
    });

    it('generates expected output', async () => {
      const idleAdapter = fork.deployment.idleAdapter;

      const idleToken = new IIdleTokenV4(fork.config.idle.bestYieldIdleDai, provider);
      const outgoingIdleTokenAmount = utils.parseEther('2');
      const minIncomingUnderlyingAmount = utils.parseEther('3');

      const result = await idleAdapter.parseAssetsForMethod(
        redeemSelector,
        idleRedeemArgs({
          idleToken,
          outgoingIdleTokenAmount,
          minIncomingUnderlyingAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(idleAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [idleToken],
        spendAssetAmounts_: [outgoingIdleTokenAmount],
        incomingAssets_: [await idleToken.token()],
        minIncomingAssetAmounts_: [minIncomingUnderlyingAmount],
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
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, fundOwner),
    });

    // Seed the fund with idleTokens to start accruing rewards
    const outgoingUnderlyingAmount = utils.parseUnits('1', await idleTokenERC20.decimals());
    await underlying.transfer(vaultProxy, outgoingUnderlyingAmount.mul(2));

    await idleLend({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      idleAdapter,
      idleToken: idleTokenERC20,
      outgoingUnderlyingAmount,
      minIncomingIdleTokenAmount: BigNumber.from(1),
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
      integrationManager,
      fundOwner,
      idleAdapter,
      idleToken: idleTokenERC20,
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

describe('claimRewardsAndReinvest', () => {
  it('claimed amounts only: claim rewards and then reinvests only the amounts claimed of each reward token', async () => {
    const [fundOwner] = fork.accounts;
    const integrationManager = fork.deployment.integrationManager;
    const idleAdapter = fork.deployment.idleAdapter;
    const idleTokenERC20 = new StandardToken(fork.config.idle.bestYieldIdleDai, provider);
    const underlying = new StandardToken(fork.config.primitives.dai, whales.dai);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, fundOwner),
    });

    // Acquire idleTokens to start accruing rewards
    const outgoingUnderlyingAmount = utils.parseUnits('1', await idleTokenERC20.decimals());
    await underlying.transfer(vaultProxy, outgoingUnderlyingAmount.mul(2));
    await idleLend({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      idleAdapter,
      idleToken: idleTokenERC20,
      outgoingUnderlyingAmount,
      minIncomingIdleTokenAmount: BigNumber.from(1),
    });

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);
    await provider.send('evm_mine', []);

    // Send some balances of the rewards assets to the vault
    await idleGov.transfer(vaultProxy, utils.parseEther('2'));

    const [preTxVaultIdleTokenBalance, preTxVaultIdleGovTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [idleTokenERC20, idleGov],
    });
    expect(preTxVaultIdleTokenBalance).toBeGtBigNumber(0);

    await idleClaimRewardsAndReinvest({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      idleAdapter,
      idleToken: idleTokenERC20,
      useFullBalances: false,
    });

    const [postTxVaultIdleTokenBalance, postTxVaultIdleGovTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [idleTokenERC20, idleGov],
    });

    // Assert only the newly claimed balances of reward tokens were used
    expect(postTxVaultIdleGovTokenBalance).toEqBigNumber(preTxVaultIdleGovTokenBalance);

    // Assert no rewards tokens are remaining in the adapter
    expect(await idleGov.balanceOf(idleAdapter)).toEqBigNumber(0);

    // Assert that the vault has an increased balance of idleTokens
    expect(postTxVaultIdleTokenBalance).toBeGtBigNumber(preTxVaultIdleTokenBalance);
  });

  it('full balances: claim rewards and then reinvests the full vault balances of each reward token', async () => {
    const [fundOwner] = fork.accounts;
    const integrationManager = fork.deployment.integrationManager;
    const idleAdapter = fork.deployment.idleAdapter;
    const idleTokenERC20 = new StandardToken(fork.config.idle.bestYieldIdleDai, provider);
    const underlying = new StandardToken(fork.config.primitives.dai, whales.dai);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, fundOwner),
    });

    // Acquire idleTokens to start accruing rewards
    const outgoingUnderlyingAmount = utils.parseUnits('1', await idleTokenERC20.decimals());
    await underlying.transfer(vaultProxy, outgoingUnderlyingAmount.mul(2));
    await idleLend({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      idleAdapter,
      idleToken: idleTokenERC20,
      outgoingUnderlyingAmount,
      minIncomingIdleTokenAmount: BigNumber.from(1),
    });

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);
    await provider.send('evm_mine', []);

    // Send some balances of the rewards assets to the vault
    await idleGov.transfer(vaultProxy, utils.parseEther('2'));

    const [preTxVaultIdleTokenBalance, preTxVaultIdleGovTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [idleTokenERC20, idleGov],
    });
    expect(preTxVaultIdleGovTokenBalance).toBeGtBigNumber(0);

    // Approve the adapter to use the fund's $IDLE
    await idleApproveAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      idleAdapter,
      idleToken: idleTokenERC20,
      assets: [idleGov],
      amounts: [constants.MaxUint256],
    });

    await idleClaimRewardsAndReinvest({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      idleAdapter,
      idleToken: idleTokenERC20,
      useFullBalances: true,
    });

    const [postTxVaultIdleTokenBalance, postTxVaultIdleGovTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [idleTokenERC20, idleGov],
    });

    // Assert entire vault balances of reward tokens were used
    expect(postTxVaultIdleGovTokenBalance).toEqBigNumber(0);

    // Assert no rewards tokens are remaining in the adapter
    expect(await idleGov.balanceOf(idleAdapter)).toEqBigNumber(0);

    // Assert that the vault has an increased balance of idleTokens
    expect(postTxVaultIdleTokenBalance).toBeGtBigNumber(preTxVaultIdleTokenBalance);
  });
});

describe('claimRewardsAndSwap', () => {
  it('claimed amounts only: claim rewards and swap only the amounts claimed of each reward token (to WETH)', async () => {
    const [fundOwner] = fork.accounts;
    const integrationManager = fork.deployment.integrationManager;
    const idleAdapter = fork.deployment.idleAdapter;
    const idleTokenERC20 = new StandardToken(fork.config.idle.bestYieldIdleDai, provider);
    const underlying = new StandardToken(fork.config.primitives.dai, whales.dai);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const incomingAsset = weth;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Acquire idleTokens to start accruing rewards
    const outgoingUnderlyingAmount = utils.parseUnits('1', await idleTokenERC20.decimals());
    await underlying.transfer(vaultProxy, outgoingUnderlyingAmount.mul(2));
    await idleLend({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      idleAdapter,
      idleToken: idleTokenERC20,
      outgoingUnderlyingAmount,
      minIncomingIdleTokenAmount: BigNumber.from(1),
    });

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);
    await provider.send('evm_mine', []);

    // Send some balances of the rewards assets to the vault
    await idleGov.transfer(vaultProxy, utils.parseEther('2'));

    const [preTxVaultIncomingAssetBalance, preTxVaultIdleGovTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, idleGov],
    });
    expect(preTxVaultIdleGovTokenBalance).toBeGtBigNumber(0);

    await idleClaimRewardsAndSwap({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      idleAdapter,
      incomingAsset,
      idleToken: idleTokenERC20,
      useFullBalances: false,
    });

    const [postTxVaultIncomingAssetBalance, postTxVaultIdleGovTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, idleGov],
    });

    // Assert only the newly claimed balances of reward tokens were used
    expect(postTxVaultIdleGovTokenBalance).toEqBigNumber(preTxVaultIdleGovTokenBalance);

    // Assert no rewards tokens are remaining in the adapter
    expect(await idleGov.balanceOf(idleAdapter)).toEqBigNumber(0);

    // Assert that the vault has an increased balance of idleTokens
    expect(postTxVaultIncomingAssetBalance).toBeGtBigNumber(preTxVaultIncomingAssetBalance);
  });

  it('full balances: claim rewards and swap the full vault balances of each reward token (to DAI)', async () => {
    const [fundOwner] = fork.accounts;
    const integrationManager = fork.deployment.integrationManager;
    const idleAdapter = fork.deployment.idleAdapter;
    const idleTokenERC20 = new StandardToken(fork.config.idle.bestYieldIdleDai, provider);
    const underlying = new StandardToken(fork.config.primitives.dai, whales.dai);
    const incomingAsset = new StandardToken(fork.config.primitives.dai, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, fundOwner),
    });

    // Acquire idleTokens to start accruing rewards
    const outgoingUnderlyingAmount = utils.parseUnits('1', await idleTokenERC20.decimals());
    await underlying.transfer(vaultProxy, outgoingUnderlyingAmount.mul(2));
    await idleLend({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      idleAdapter,
      idleToken: idleTokenERC20,
      outgoingUnderlyingAmount,
      minIncomingIdleTokenAmount: BigNumber.from(1),
    });

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);
    await provider.send('evm_mine', []);

    // Send some balances of the rewards assets to the vault
    await idleGov.transfer(vaultProxy, utils.parseEther('2'));

    const [preTxVaultIncomingAssetBalance, preTxVaultIdleGovTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, idleGov],
    });
    expect(preTxVaultIdleGovTokenBalance).toBeGtBigNumber(0);

    // Approve the adapter to use the fund's $IDLE
    await idleApproveAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      idleAdapter,
      idleToken: idleTokenERC20,
      assets: [idleGov],
      amounts: [constants.MaxUint256],
    });

    await idleClaimRewardsAndSwap({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      idleAdapter,
      incomingAsset,
      idleToken: idleTokenERC20,
      useFullBalances: true,
    });

    const [postTxVaultIncomingAssetBalance, postTxVaultIdleGovTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, idleGov],
    });

    // Assert entire vault balances of reward tokens were used
    expect(postTxVaultIdleGovTokenBalance).toEqBigNumber(0);

    // Assert no rewards tokens are remaining in the adapter
    expect(await idleGov.balanceOf(idleAdapter)).toEqBigNumber(0);

    // Assert that the vault has an increased balance of idleTokens
    expect(postTxVaultIncomingAssetBalance).toBeGtBigNumber(preTxVaultIncomingAssetBalance);
  });
});

describe('lend', () => {
  it('works as expected when called for lending by a fund', async () => {
    const [fundOwner] = fork.accounts;
    const idleToken = new StandardToken(fork.config.idle.bestYieldIdleDai, provider);
    const outgoingToken = new StandardToken(fork.config.primitives.dai, whales.dai);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, fundOwner),
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
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      idleAdapter: fork.deployment.idleAdapter,
      idleToken,
      outgoingUnderlyingAmount,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [idleToken, outgoingToken],
    });

    expect(postTxIncomingAssetBalance).toBeGtBigNumber(0);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(outgoingUnderlyingAmount));

    // Rounding up from 783108
    expect(lendReceipt).toCostLessThan('822000');
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
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, fundOwner),
    });

    // Seed the fund with more than the necessary amount of outgoing asset
    const outgoingUnderlyingAmount = utils.parseUnits('1', await idleTokenERC20.decimals());
    await token.transfer(vaultProxy, outgoingUnderlyingAmount.mul(2));

    await idleLend({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      idleAdapter,
      idleToken: idleTokenERC20,
      outgoingUnderlyingAmount,
      minIncomingIdleTokenAmount: BigNumber.from(1),
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
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      idleAdapter: fork.deployment.idleAdapter,
      idleToken: idleTokenERC20,
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

    // Rounding up from 787170
    expect(redeemReceipt).toCostLessThan('788000');
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
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, fundOwner),
    });

    // Lend for idleToken
    const lendAmount = utils.parseUnits('2', await outgoingToken.decimals());
    await outgoingToken.transfer(vaultProxy, lendAmount);
    await idleLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      idleAdapter,
      idleToken: idleTokenERC20,
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
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      idleAdapter,
      idleToken: idleTokenERC20,
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
