import { randomAddress } from '@enzymefinance/ethers';
import {
  claimRewardsSelector,
  curveAaveLendAndStakeArgs,
  curveAaveLendArgs,
  curveAaveRedeemArgs,
  curveAaveStakeArgs,
  curveAaveUnstakeAndRedeemArgs,
  curveAaveUnstakeArgs,
  lendAndStakeSelector,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
  stakeSelector,
  StandardToken,
  unstakeAndRedeemSelector,
  unstakeSelector,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  aaveLend,
  createNewFund,
  curveAaveClaimRewards,
  curveAaveLend,
  curveAaveLendAndStake,
  curveAaveRedeem,
  curveAaveStake,
  curveAaveUnstake,
  curveAaveUnstakeAndRedeem,
  deployProtocolFixture,
  getAssetBalances,
  vaultCallCurveMinterToggleApproveMint,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

// TODO: Figure out what's going on with these random test failures. Probably just a caching issue?
xdescribe('constructor', () => {
  it('sets state vars', async () => {
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;

    expect(await curveLiquidityAaveAdapter.getLpToken()).toMatchAddress(fork.config.curve.pools.aave.lpToken);
    expect(await curveLiquidityAaveAdapter.getLiquidityGaugeToken()).toMatchAddress(
      fork.config.curve.pools.aave.liquidityGaugeToken,
    );

    // Pool tokens
    const orderedPoolTokens = [
      fork.config.aave.atokens.adai[0],
      fork.config.aave.atokens.ausdc[0],
      fork.config.aave.atokens.ausdt[0],
    ];
    for (const i in orderedPoolTokens) {
      expect(await curveLiquidityAaveAdapter.getAssetByPoolIndex(i, false)).toMatchAddress(orderedPoolTokens[i]);
    }

    const orderedPoolTokenUnderlyings = [
      fork.config.primitives.dai,
      fork.config.primitives.usdc,
      fork.config.primitives.usdt,
    ];
    for (const i in orderedPoolTokenUnderlyings) {
      expect(await curveLiquidityAaveAdapter.getAssetByPoolIndex(i, true)).toMatchAddress(
        orderedPoolTokenUnderlyings[i],
      );
    }

    // AdapterBase
    expect(await curveLiquidityAaveAdapter.getIntegrationManager()).toMatchAddress(fork.deployment.integrationManager);

    // CurveGaugeV2RewardsHandlerBase
    expect(await curveLiquidityAaveAdapter.getCurveGaugeV2RewardsHandlerCrvToken()).toMatchAddress(
      fork.config.primitives.crv,
    );
    expect(await curveLiquidityAaveAdapter.getCurveGaugeV2RewardsHandlerMinter()).toMatchAddress(
      fork.config.curve.minter,
    );

    // CurveAaveLiquidityActionsMixin
    expect(await curveLiquidityAaveAdapter.getCurveAaveLiquidityPool()).toMatchAddress(
      fork.config.curve.pools.aave.pool,
    );
  });
});

xdescribe('parseAssetsForAction', () => {
  it('does not allow a bad selector', async () => {
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;

    await expect(
      curveLiquidityAaveAdapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), constants.HashZero),
    ).rejects.toBeRevertedWith('_selector invalid');
  });

  describe('claimRewards', () => {
    it('generates expected output', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;

      const result = await curveLiquidityAaveAdapter.parseAssetsForAction(
        randomAddress(),
        claimRewardsSelector,
        constants.HashZero,
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForAction, {
        incomingAssets_: [],
        minIncomingAssetAmounts_: [],
        spendAssetAmounts_: [],
        spendAssetsHandleType_: SpendAssetsHandleType.None,
        spendAssets_: [],
      });
    });
  });

  describe('lend', () => {
    it('generates expected output (one asset only, not underlying)', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const outgoingAaveDaiAmount = utils.parseEther('2');
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityAaveAdapter.parseAssetsForAction(
        randomAddress(),
        lendSelector,
        curveAaveLendArgs({
          minIncomingLPTokenAmount,
          outgoingAaveDaiAmount,
          outgoingAaveUsdcAmount: BigNumber.from(0),
          outgoingAaveUsdtAmount: BigNumber.from(0),
          useUnderlyings: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.aave.lpToken],

        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
        // aToken
        spendAssetAmounts_: [outgoingAaveDaiAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.aave.atokens.adai[0]],
      });
    });

    it('generates expected output (two assets, underlyings)', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const outgoingAaveDaiAmount = utils.parseEther('2');
      const outgoingAaveUsdtAmount = utils.parseEther('3');
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityAaveAdapter.parseAssetsForAction(
        randomAddress(),
        lendSelector,
        curveAaveLendArgs({
          minIncomingLPTokenAmount,
          outgoingAaveDaiAmount,
          outgoingAaveUsdcAmount: BigNumber.from(0),
          outgoingAaveUsdtAmount,
          useUnderlyings: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.aave.lpToken],

        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
        // aToken underlyings
        spendAssetAmounts_: [outgoingAaveDaiAmount, outgoingAaveUsdtAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.primitives.dai, fork.config.primitives.usdt],
      });
    });
  });

  describe('lendAndStake', () => {
    it('generates expected output (one asset only, not underlying)', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const outgoingAaveDaiAmount = utils.parseEther('2');
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityAaveAdapter.parseAssetsForAction(
        randomAddress(),
        lendAndStakeSelector,
        curveAaveLendAndStakeArgs({
          minIncomingLiquidityGaugeTokenAmount,
          outgoingAaveDaiAmount,
          outgoingAaveUsdcAmount: BigNumber.from(0),
          outgoingAaveUsdtAmount: BigNumber.from(0),
          useUnderlyings: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.aave.liquidityGaugeToken],

        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
        // aToken
        spendAssetAmounts_: [outgoingAaveDaiAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.aave.atokens.adai[0]],
      });
    });

    it('generates expected output (two assets, underlyings)', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const outgoingAaveDaiAmount = utils.parseEther('2');
      const outgoingAaveUsdtAmount = utils.parseEther('3');
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityAaveAdapter.parseAssetsForAction(
        randomAddress(),
        lendAndStakeSelector,
        curveAaveLendAndStakeArgs({
          minIncomingLiquidityGaugeTokenAmount,
          outgoingAaveDaiAmount,
          outgoingAaveUsdcAmount: BigNumber.from(0),
          outgoingAaveUsdtAmount,
          useUnderlyings: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.aave.liquidityGaugeToken],

        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
        // aToken underlyings
        spendAssetAmounts_: [outgoingAaveDaiAmount, outgoingAaveUsdtAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.primitives.dai, fork.config.primitives.usdt],
      });
    });
  });

  describe('redeem', () => {
    it('single asset redemption does not allow multiple incoming assets', async () => {
      await expect(
        fork.deployment.curveLiquidityAaveAdapter.parseAssetsForAction(
          randomAddress(),
          redeemSelector,
          curveAaveRedeemArgs({
            minIncomingAaveDaiAmount: BigNumber.from(1),
            minIncomingAaveUsdcAmount: BigNumber.from(1),
            minIncomingAaveUsdtAmount: BigNumber.from(0),
            outgoingLPTokenAmount: BigNumber.from(1),
            receiveSingleAsset: true,
            useUnderlyings: false,
          }),
        ),
      ).rejects.toBeRevertedWith('Too many min asset amounts specified');
    });

    it('single asset redemption does not allow no incoming assets', async () => {
      await expect(
        fork.deployment.curveLiquidityAaveAdapter.parseAssetsForAction(
          randomAddress(),
          redeemSelector,
          curveAaveRedeemArgs({
            minIncomingAaveDaiAmount: BigNumber.from(0),
            minIncomingAaveUsdcAmount: BigNumber.from(0),
            minIncomingAaveUsdtAmount: BigNumber.from(0),
            outgoingLPTokenAmount: BigNumber.from(1),
            receiveSingleAsset: true,
            useUnderlyings: false,
          }),
        ),
      ).rejects.toBeRevertedWith('No min asset amount');
    });

    it('generates expected output (no single asset, no underlyings)', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const minIncomingAaveDaiAmount = utils.parseEther('3');
      const minIncomingAaveUsdcAmount = utils.parseEther('2');
      const minIncomingAaveUsdtAmount = utils.parseEther('1.5');
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityAaveAdapter.parseAssetsForAction(
        randomAddress(),
        redeemSelector,
        curveAaveRedeemArgs({
          minIncomingAaveDaiAmount,
          minIncomingAaveUsdcAmount,
          minIncomingAaveUsdtAmount,
          outgoingLPTokenAmount,
          receiveSingleAsset: false,
          useUnderlyings: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForAction, {
        incomingAssets_: [
          fork.config.aave.atokens.adai[0],
          fork.config.aave.atokens.ausdc[0],
          fork.config.aave.atokens.ausdt[0],
        ],
        minIncomingAssetAmounts_: [minIncomingAaveDaiAmount, minIncomingAaveUsdcAmount, minIncomingAaveUsdtAmount],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.aave.lpToken],
      });
    });

    it('generates expected output (single asset, underlyings)', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const minIncomingAaveUsdcAmount = utils.parseEther('2');
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityAaveAdapter.parseAssetsForAction(
        randomAddress(),
        redeemSelector,
        curveAaveRedeemArgs({
          minIncomingAaveDaiAmount: BigNumber.from(0),
          minIncomingAaveUsdcAmount,
          minIncomingAaveUsdtAmount: BigNumber.from(0),
          outgoingLPTokenAmount,
          receiveSingleAsset: true,
          useUnderlyings: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.primitives.usdc],
        minIncomingAssetAmounts_: [minIncomingAaveUsdcAmount],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.aave.lpToken],
      });
    });
  });

  describe('stake', () => {
    it('generates expected output', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const outgoingLPTokenAmount = utils.parseEther('2');

      const result = await curveLiquidityAaveAdapter.parseAssetsForAction(
        randomAddress(),
        stakeSelector,
        curveAaveStakeArgs({
          outgoingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.aave.liquidityGaugeToken],
        minIncomingAssetAmounts_: [outgoingLPTokenAmount],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.aave.lpToken],
      });
    });
  });

  describe('unstake', () => {
    it('generates expected output', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('2');

      const result = await curveLiquidityAaveAdapter.parseAssetsForAction(
        randomAddress(),
        unstakeSelector,
        curveAaveUnstakeArgs({
          outgoingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.aave.lpToken],
        minIncomingAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.aave.liquidityGaugeToken],
      });
    });
  });

  describe('unstakeAndRedeem', () => {
    it('single asset redemption does not allow multiple incoming assets', async () => {
      await expect(
        fork.deployment.curveLiquidityAaveAdapter.parseAssetsForAction(
          randomAddress(),
          unstakeAndRedeemSelector,
          curveAaveUnstakeAndRedeemArgs({
            minIncomingAaveDaiAmount: BigNumber.from(1),
            minIncomingAaveUsdcAmount: BigNumber.from(1),
            minIncomingAaveUsdtAmount: BigNumber.from(0),
            outgoingLiquidityGaugeTokenAmount: BigNumber.from(1),
            receiveSingleAsset: true,
            useUnderlyings: false,
          }),
        ),
      ).rejects.toBeRevertedWith('Too many min asset amounts specified');
    });

    it('single asset redemption does not allow no incoming assets', async () => {
      await expect(
        fork.deployment.curveLiquidityAaveAdapter.parseAssetsForAction(
          randomAddress(),
          unstakeAndRedeemSelector,
          curveAaveUnstakeAndRedeemArgs({
            minIncomingAaveDaiAmount: BigNumber.from(0),
            minIncomingAaveUsdcAmount: BigNumber.from(0),
            minIncomingAaveUsdtAmount: BigNumber.from(0),
            outgoingLiquidityGaugeTokenAmount: BigNumber.from(1),
            receiveSingleAsset: true,
            useUnderlyings: false,
          }),
        ),
      ).rejects.toBeRevertedWith('No min asset amount');
    });

    it('generates expected output (no single asset, no underlyings)', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const minIncomingAaveDaiAmount = utils.parseEther('3');
      const minIncomingAaveUsdcAmount = utils.parseEther('2');
      const minIncomingAaveUsdtAmount = utils.parseEther('1.5');
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityAaveAdapter.parseAssetsForAction(
        randomAddress(),
        unstakeAndRedeemSelector,
        curveAaveUnstakeAndRedeemArgs({
          minIncomingAaveDaiAmount,
          minIncomingAaveUsdcAmount,
          minIncomingAaveUsdtAmount,
          outgoingLiquidityGaugeTokenAmount,
          receiveSingleAsset: false,
          useUnderlyings: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForAction, {
        incomingAssets_: [
          fork.config.aave.atokens.adai[0],
          fork.config.aave.atokens.ausdc[0],
          fork.config.aave.atokens.ausdt[0],
        ],
        minIncomingAssetAmounts_: [minIncomingAaveDaiAmount, minIncomingAaveUsdcAmount, minIncomingAaveUsdtAmount],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.aave.liquidityGaugeToken],
      });
    });

    it('generates expected output (single asset, underlyings)', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const minIncomingAaveUsdcAmount = utils.parseEther('2');
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityAaveAdapter.parseAssetsForAction(
        randomAddress(),
        unstakeAndRedeemSelector,
        curveAaveUnstakeAndRedeemArgs({
          minIncomingAaveDaiAmount: BigNumber.from(0),
          minIncomingAaveUsdcAmount,
          minIncomingAaveUsdtAmount: BigNumber.from(0),
          outgoingLiquidityGaugeTokenAmount,
          receiveSingleAsset: true,
          useUnderlyings: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.primitives.usdc],
        minIncomingAssetAmounts_: [minIncomingAaveUsdcAmount],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.aave.liquidityGaugeToken],
      });
    });
  });
});

xdescribe('claimRewards', () => {
  it('claims CRV, which lands in the vault', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const crv = new StandardToken(fork.config.primitives.crv, provider);
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Lend and stake to start accruing rewards
    const seedDaiAmount = utils.parseEther('2');
    await dai.transfer(vaultProxy, seedDaiAmount);
    await curveAaveLendAndStake({
      comptrollerProxy,
      curveLiquidityAaveAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      outgoingAaveDaiAmount: seedDaiAmount,
      useUnderlyings: true,
    });

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);

    const [preClaimRewardsCrvBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv],
    });

    // Approve the adapter to claim $CRV rewards on behalf of the vault
    await vaultCallCurveMinterToggleApproveMint({
      account: curveLiquidityAaveAdapter,
      comptrollerProxy,
      minter: fork.config.curve.minter,
    });

    // Claim all earned rewards
    await curveAaveClaimRewards({
      comptrollerProxy,
      curveLiquidityAaveAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
    });

    const [postClaimRewardsCrvBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv],
    });

    // Assert vault balances of reward tokens have increased
    expect(postClaimRewardsCrvBalance).toBeGtBigNumber(preClaimRewardsCrvBalance);
  });
});

xdescribe('lend', () => {
  it('works as expected (three spend assets, underlyings)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
    const usdc = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    const usdt = new StandardToken(fork.config.primitives.usdt, whales.usdt);
    const lpToken = new StandardToken(fork.config.curve.pools.aave.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with surplus of outgoing assets
    const outgoingAaveDaiAmount = utils.parseUnits('2', await dai.decimals());
    const outgoingAaveUsdcAmount = utils.parseUnits('3', await usdc.decimals());
    const outgoingAaveUsdtAmount = utils.parseUnits('10', await usdt.decimals());
    await dai.transfer(vaultProxy, outgoingAaveDaiAmount.mul(2));
    await usdc.transfer(vaultProxy, outgoingAaveUsdcAmount.mul(2));
    await usdt.transfer(vaultProxy, outgoingAaveUsdtAmount.mul(2));

    const [preTxDaiBalance, preTxUsdcBalance, preTxUsdtBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [dai, usdc, usdt],
    });

    await curveAaveLend({
      comptrollerProxy,
      curveLiquidityAaveAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      outgoingAaveDaiAmount,
      outgoingAaveUsdcAmount,
      outgoingAaveUsdtAmount,
      useUnderlyings: true,
    });

    const [postTxDaiBalance, postTxUsdcBalance, postTxUsdtBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [dai, usdc, usdt, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxDaiBalance).toEqBigNumber(preTxDaiBalance.sub(outgoingAaveDaiAmount));
    expect(postTxUsdcBalance).toEqBigNumber(preTxUsdcBalance.sub(outgoingAaveUsdcAmount));
    expect(postTxUsdtBalance).toEqBigNumber(preTxUsdtBalance.sub(outgoingAaveUsdtAmount));

    // TODO: get expected incoming amount
    expect(postTxLpTokenBalance).toBeGtBigNumber(0);
  });

  it('works as expected (one spend asset, not underlying)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const integrationManager = fork.deployment.integrationManager;
    const usdc = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    const ausdc = new StandardToken(fork.config.aave.atokens.ausdc[0], provider);
    const lpToken = new StandardToken(fork.config.curve.pools.aave.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with surplus of outgoing asset
    const seedUsdcAmount = utils.parseUnits('3', await usdc.decimals());
    await usdc.transfer(vaultProxy, seedUsdcAmount);
    await aaveLend({
      aToken: ausdc,
      aaveAdapter: fork.deployment.aaveAdapter,
      amount: seedUsdcAmount,
      comptrollerProxy,
      fundOwner,
      integrationManager,
    });

    const [preTxAaveUsdcBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [ausdc],
    });

    const outgoingAaveUsdcAmount = preTxAaveUsdcBalance.div(4);

    await curveAaveLend({
      comptrollerProxy,
      curveLiquidityAaveAdapter,
      fundOwner,
      integrationManager,
      outgoingAaveUsdcAmount,
      useUnderlyings: false, // Unnecessary, but explicit for test
    });

    const [postTxAaveUsdcBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [ausdc, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxAaveUsdcBalance).toBeAroundBigNumber(preTxAaveUsdcBalance.sub(outgoingAaveUsdcAmount), 2);

    // TODO: get expected incoming amount
    expect(postTxLpTokenBalance).toBeGtBigNumber(0);
  });
});

xdescribe('lendAndStake', () => {
  it('works as expected (three spend assets, underlyings)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
    const usdc = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    const usdt = new StandardToken(fork.config.primitives.usdt, whales.usdt);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.aave.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with surplus of outgoing assets
    const outgoingAaveDaiAmount = utils.parseUnits('2', await dai.decimals());
    const outgoingAaveUsdcAmount = utils.parseUnits('3', await usdc.decimals());
    const outgoingAaveUsdtAmount = utils.parseUnits('10', await usdt.decimals());
    await dai.transfer(vaultProxy, outgoingAaveDaiAmount.mul(2));
    await usdc.transfer(vaultProxy, outgoingAaveUsdcAmount.mul(2));
    await usdt.transfer(vaultProxy, outgoingAaveUsdtAmount.mul(2));

    const [preTxDaiBalance, preTxUsdcBalance, preTxUsdtBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [dai, usdc, usdt],
    });

    await curveAaveLendAndStake({
      comptrollerProxy,
      curveLiquidityAaveAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      outgoingAaveDaiAmount,
      outgoingAaveUsdcAmount,
      outgoingAaveUsdtAmount,
      useUnderlyings: true,
    });

    const [postTxDaiBalance, postTxUsdcBalance, postTxUsdtBalance, postTxLiquidityGaugeTokenBalance] =
      await getAssetBalances({
        account: vaultProxy,
        assets: [dai, usdc, usdt, liquidityGaugeToken],
      });

    // Assert the amounts spent and received
    expect(postTxDaiBalance).toEqBigNumber(preTxDaiBalance.sub(outgoingAaveDaiAmount));
    expect(postTxUsdcBalance).toEqBigNumber(preTxUsdcBalance.sub(outgoingAaveUsdcAmount));
    expect(postTxUsdtBalance).toEqBigNumber(preTxUsdtBalance.sub(outgoingAaveUsdtAmount));

    // TODO: get expected incoming amount
    expect(postTxLiquidityGaugeTokenBalance).toBeGtBigNumber(0);
  });

  it('works as expected (one spend asset, not underlying)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const integrationManager = fork.deployment.integrationManager;
    const usdc = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    const ausdc = new StandardToken(fork.config.aave.atokens.ausdc[0], provider);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.aave.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with surplus of outgoing asset
    const seedUsdcAmount = utils.parseUnits('3', await usdc.decimals());
    await usdc.transfer(vaultProxy, seedUsdcAmount);
    await aaveLend({
      aToken: ausdc,
      aaveAdapter: fork.deployment.aaveAdapter,
      amount: seedUsdcAmount,
      comptrollerProxy,
      fundOwner,
      integrationManager,
    });

    const [preTxAaveUsdcBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [ausdc],
    });

    const outgoingAaveUsdcAmount = preTxAaveUsdcBalance.div(4);

    await curveAaveLendAndStake({
      comptrollerProxy,
      curveLiquidityAaveAdapter,
      fundOwner,
      integrationManager,
      outgoingAaveUsdcAmount,
      useUnderlyings: false, // Unnecessary, but explicit for test
    });

    const [postTxAaveUsdcBalance, postTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [ausdc, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxAaveUsdcBalance).toBeAroundBigNumber(preTxAaveUsdcBalance.sub(outgoingAaveUsdcAmount), 2);

    // TODO: get expected incoming amount
    expect(postTxLiquidityGaugeTokenBalance).toBeGtBigNumber(0);
  });
});

xdescribe('redeem', () => {
  it('works as expected (no single-asset, no underlying)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
    const adai = new StandardToken(fork.config.aave.atokens.adai[0], provider);
    const ausdc = new StandardToken(fork.config.aave.atokens.ausdc[0], provider);
    const ausdt = new StandardToken(fork.config.aave.atokens.ausdt[0], provider);
    const lpToken = new StandardToken(fork.config.curve.pools.aave.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with lp tokens
    const seedDaiAmount = utils.parseEther('2');
    await dai.transfer(vaultProxy, seedDaiAmount);
    await curveAaveLend({
      comptrollerProxy,
      curveLiquidityAaveAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      outgoingAaveDaiAmount: seedDaiAmount,
      useUnderlyings: true,
    });

    const [preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    await curveAaveRedeem({
      comptrollerProxy,
      curveLiquidityAaveAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      outgoingLPTokenAmount,
      receiveSingleAsset: false, // Unnecessary, but explicit for test
      useUnderlyings: false, // Unnecessary, but explicit for test
    });

    const [postTxAaveDaiBalance, postTxAaveUsdcBalance, postTxAaveUsdtBalance, postTxLpTokenBalance] =
      await getAssetBalances({
        account: vaultProxy,
        assets: [adai, ausdc, ausdt, lpToken],
      });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLPTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxAaveDaiBalance).toBeGtBigNumber(0);
    expect(postTxAaveUsdcBalance).toBeGtBigNumber(0);
    expect(postTxAaveUsdtBalance).toBeGtBigNumber(0);
  });

  it('works as expected (single-asset, underlying)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
    const usdc = new StandardToken(fork.config.primitives.usdc, provider);
    const usdt = new StandardToken(fork.config.primitives.usdt, provider);
    const lpToken = new StandardToken(fork.config.curve.pools.aave.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with lp tokens
    const seedDaiAmount = utils.parseEther('2');
    await dai.transfer(vaultProxy, seedDaiAmount);
    await curveAaveLend({
      comptrollerProxy,
      curveLiquidityAaveAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      outgoingAaveDaiAmount: seedDaiAmount,
      useUnderlyings: true,
    });

    const [preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    await curveAaveRedeem({
      comptrollerProxy,
      curveLiquidityAaveAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingAaveDaiAmount: BigNumber.from(0),
      minIncomingAaveUsdtAmount: BigNumber.from(0),
      outgoingLPTokenAmount,
      receiveSingleAsset: true,
      useUnderlyings: true,
    });

    const [postTxDaiBalance, postTxUsdcBalance, postTxUsdtBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [dai, usdc, usdt, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLPTokenAmount));
    // Only USDC should have been received
    // TODO: get expected incoming amounts
    expect(postTxUsdcBalance).toBeGtBigNumber(0);
    expect(postTxDaiBalance).toEqBigNumber(0);
    expect(postTxUsdtBalance).toEqBigNumber(0);
  });
});

xdescribe('unstakeAndRedeem', () => {
  it('works as expected (no single-asset, no underlying)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
    const adai = new StandardToken(fork.config.aave.atokens.adai[0], provider);
    const ausdc = new StandardToken(fork.config.aave.atokens.ausdc[0], provider);
    const ausdt = new StandardToken(fork.config.aave.atokens.ausdt[0], provider);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.aave.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with liquidity gauge tokens
    const seedDaiAmount = utils.parseEther('2');
    await dai.transfer(vaultProxy, seedDaiAmount);
    await curveAaveLendAndStake({
      comptrollerProxy,
      curveLiquidityAaveAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      outgoingAaveDaiAmount: seedDaiAmount,
      useUnderlyings: true,
    });

    const [preTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLiquidityGaugeTokenBalance.div(2);

    await curveAaveUnstakeAndRedeem({
      comptrollerProxy,
      curveLiquidityAaveAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      outgoingLiquidityGaugeTokenAmount,
      receiveSingleAsset: false, // Unnecessary, but explicit for test
      useUnderlyings: false, // Unnecessary, but explicit for test
    });

    const [postTxAaveDaiBalance, postTxAaveUsdcBalance, postTxAaveUsdtBalance, postTxLiquidityGaugeTokenBalance] =
      await getAssetBalances({
        account: vaultProxy,
        assets: [adai, ausdc, ausdt, liquidityGaugeToken],
      });

    // Assert the amounts spent and received
    expect(postTxLiquidityGaugeTokenBalance).toEqBigNumber(
      preTxLiquidityGaugeTokenBalance.sub(outgoingLiquidityGaugeTokenAmount),
    );
    // TODO: get expected incoming amounts
    expect(postTxAaveDaiBalance).toBeGtBigNumber(0);
    expect(postTxAaveUsdcBalance).toBeGtBigNumber(0);
    expect(postTxAaveUsdtBalance).toBeGtBigNumber(0);
  });

  it('works as expected (single-asset, underlying)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
    const usdc = new StandardToken(fork.config.primitives.usdc, provider);
    const usdt = new StandardToken(fork.config.primitives.usdt, provider);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.aave.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with liquidity gauge tokens
    const seedDaiAmount = utils.parseEther('2');
    await dai.transfer(vaultProxy, seedDaiAmount);
    await curveAaveLendAndStake({
      comptrollerProxy,
      curveLiquidityAaveAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      outgoingAaveDaiAmount: seedDaiAmount,
      useUnderlyings: true,
    });

    const [preTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLiquidityGaugeTokenBalance.div(2);

    await curveAaveUnstakeAndRedeem({
      comptrollerProxy,
      curveLiquidityAaveAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingAaveDaiAmount: BigNumber.from(0),
      minIncomingAaveUsdtAmount: BigNumber.from(0),
      outgoingLiquidityGaugeTokenAmount,
      receiveSingleAsset: true,
      useUnderlyings: true,
    });

    const [postTxDaiBalance, postTxUsdcBalance, postTxUsdtBalance, postTxLiquidityGaugeTokenBalance] =
      await getAssetBalances({
        account: vaultProxy,
        assets: [dai, usdc, usdt, liquidityGaugeToken],
      });

    // Assert the amounts spent and received
    expect(postTxLiquidityGaugeTokenBalance).toEqBigNumber(
      preTxLiquidityGaugeTokenBalance.sub(outgoingLiquidityGaugeTokenAmount),
    );
    // Only USDC should have been received
    // TODO: get expected incoming amounts
    expect(postTxUsdcBalance).toBeGtBigNumber(0);
    expect(postTxDaiBalance).toEqBigNumber(0);
    expect(postTxUsdtBalance).toEqBigNumber(0);
  });
});

xdescribe('stake and unstake', () => {
  it('correctly handles staking and then unstaking partial balances', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.aave.liquidityGaugeToken, provider);
    const lpToken = new StandardToken(fork.config.curve.pools.aave.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with lp tokens
    const seedDaiAmount = utils.parseEther('2');
    await dai.transfer(vaultProxy, seedDaiAmount);
    await curveAaveLend({
      comptrollerProxy,
      curveLiquidityAaveAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      outgoingAaveDaiAmount: seedDaiAmount,
      useUnderlyings: true,
    });

    // Stake the LP tokens
    const preStakeTxLpTokenBalance = await lpToken.balanceOf(vaultProxy);
    const stakeLPTokenAmount = preStakeTxLpTokenBalance.div(2);

    await curveAaveStake({
      comptrollerProxy,
      curveLiquidityAaveAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      outgoingLPTokenAmount: stakeLPTokenAmount,
    });

    const [postStakeTxLpTokenBalance, postStakeTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [lpToken, liquidityGaugeToken],
    });

    // Assert the amounts spent and received in staking
    expect(postStakeTxLpTokenBalance).toEqBigNumber(preStakeTxLpTokenBalance.sub(stakeLPTokenAmount));
    expect(postStakeTxLiquidityGaugeTokenBalance).toEqBigNumber(stakeLPTokenAmount);

    // Unstake half of the tokens
    const unstakeLiquidityGaugeTokenAmount = stakeLPTokenAmount.div(2);
    await curveAaveUnstake({
      comptrollerProxy,
      curveLiquidityAaveAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      outgoingLiquidityGaugeTokenAmount: unstakeLiquidityGaugeTokenAmount,
    });

    const [postUnstakeTxLpTokenBalance, postUnstakeTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [lpToken, liquidityGaugeToken],
    });

    // Assert the amounts spent and received in unstaking
    expect(postUnstakeTxLpTokenBalance).toEqBigNumber(postStakeTxLpTokenBalance.add(unstakeLiquidityGaugeTokenAmount));
    expect(postUnstakeTxLiquidityGaugeTokenBalance).toEqBigNumber(
      postStakeTxLiquidityGaugeTokenBalance.sub(unstakeLiquidityGaugeTokenAmount),
    );
  });
});
