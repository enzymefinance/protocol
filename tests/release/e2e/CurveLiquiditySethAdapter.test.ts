import { randomAddress } from '@enzymefinance/ethers';
import {
  approveAssetsSelector,
  claimRewardsAndReinvestSelector,
  claimRewardsAndSwapSelector,
  claimRewardsSelector,
  curveApproveAssetsArgs,
  curveSethClaimRewardsAndReinvestArgs,
  curveSethClaimRewardsAndSwapArgs,
  curveSethLendArgs,
  curveSethLendAndStakeArgs,
  curveSethRedeemArgs,
  curveSethStakeArgs,
  curveSethUnstakeArgs,
  curveSethUnstakeAndRedeemArgs,
  lendAndStakeSelector,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
  stakeSelector,
  StandardToken,
  unstakeSelector,
  unstakeAndRedeemSelector,
} from '@enzymefinance/protocol';
import {
  createNewFund,
  curveApproveAssets,
  curveSethClaimRewards,
  curveSethClaimRewardsAndReinvest,
  curveSethClaimRewardsAndSwap,
  curveSethLend,
  curveSethLendAndStake,
  curveSethRedeem,
  curveSethStake,
  curveSethUnstake,
  curveSethUnstakeAndRedeem,
  deployProtocolFixture,
  getAssetBalances,
  ProtocolDeployment,
  vaultCallCurveMinterToggleApproveMint,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;

    expect(await curveLiquiditySethAdapter.getLpToken()).toMatchAddress(fork.config.curve.pools.seth.lpToken);
    expect(await curveLiquiditySethAdapter.getLiquidityGaugeToken()).toMatchAddress(
      fork.config.curve.pools.seth.liquidityGaugeToken,
    );
    expect(await curveLiquiditySethAdapter.getSethToken()).toMatchAddress(fork.config.synthetix.synths.seth);

    // AdapterBase
    expect(await curveLiquiditySethAdapter.getIntegrationManager()).toMatchAddress(fork.deployment.integrationManager);

    // CurveGaugeV2RewardsHandlerBase
    expect(await curveLiquiditySethAdapter.getCurveGaugeV2RewardsHandlerCrvToken()).toMatchAddress(
      fork.config.primitives.crv,
    );
    expect(await curveLiquiditySethAdapter.getCurveGaugeV2RewardsHandlerMinter()).toMatchAddress(
      fork.config.curve.minter,
    );

    // CurveSethLiquidityActionsMixin
    expect(await curveLiquiditySethAdapter.getCurveSethLiquidityPool()).toMatchAddress(
      fork.config.curve.pools.seth.pool,
    );
    expect(await curveLiquiditySethAdapter.getCurveSethLiquidityWethToken()).toMatchAddress(fork.config.weth);

    // UniswapV2ActionsMixin
    expect(await curveLiquiditySethAdapter.getUniswapV2Router2()).toMatchAddress(fork.config.uniswap.router);
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;

    await expect(
      curveLiquiditySethAdapter.parseAssetsForMethod(utils.randomBytes(4), constants.HashZero),
    ).rejects.toBeRevertedWith('_selector invalid');
  });

  describe('approveAssets', () => {
    it('does not allow unequal input arrays', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;

      await expect(
        curveLiquiditySethAdapter.parseAssetsForMethod(
          approveAssetsSelector,
          curveApproveAssetsArgs({
            assets: [randomAddress(), randomAddress()],
            amounts: [1],
          }),
        ),
      ).rejects.toBeRevertedWith('Unequal arrays');
    });

    it('does not allow an asset that is not a rewards token (with an amount >0)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;

      await expect(
        curveLiquiditySethAdapter.parseAssetsForMethod(
          approveAssetsSelector,
          curveApproveAssetsArgs({
            assets: [randomAddress()],
            amounts: [1],
          }),
        ),
      ).rejects.toBeRevertedWith('Invalid reward token');
    });

    it('generates expected output', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;

      // Random address should be allowed since amount is 0
      const assets = [fork.config.primitives.crv, randomAddress()];
      const amounts = [1, 0];
      const result = await curveLiquiditySethAdapter.parseAssetsForMethod(
        approveAssetsSelector,
        curveApproveAssetsArgs({
          assets,
          amounts,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Approve,
        spendAssets_: assets,
        spendAssetAmounts_: amounts,
        incomingAssets_: [],
        minIncomingAssetAmounts_: [],
      });
    });
  });

  describe('claimRewards', () => {
    it('generates expected output', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;

      const result = await curveLiquiditySethAdapter.parseAssetsForMethod(claimRewardsSelector, constants.HashZero);

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.None,
        spendAssets_: [],
        spendAssetAmounts_: [],
        incomingAssets_: [],
        minIncomingAssetAmounts_: [],
      });
    });
  });

  describe('claimRewardsAndReinvest', () => {
    it('generates expected output', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('2');

      const result = await curveLiquiditySethAdapter.parseAssetsForMethod(
        claimRewardsAndReinvestSelector,
        curveSethClaimRewardsAndReinvestArgs({
          useFullBalances: true, // Does not matter
          minIncomingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.None,
        spendAssets_: [],
        spendAssetAmounts_: [],
        incomingAssets_: [fork.config.curve.pools.seth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
      });
    });
  });

  describe('claimRewardsAndSwap', () => {
    it('generates expected output', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const incomingAsset = randomAddress();
      const minIncomingAssetAmount = utils.parseEther('2');

      const result = await curveLiquiditySethAdapter.parseAssetsForMethod(
        claimRewardsAndSwapSelector,
        curveSethClaimRewardsAndSwapArgs({
          useFullBalances: true, // Does not matter
          incomingAsset,
          minIncomingAssetAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.None,
        spendAssets_: [],
        spendAssetAmounts_: [],
        incomingAssets_: [incomingAsset],
        minIncomingAssetAmounts_: [minIncomingAssetAmount],
      });
    });
  });

  describe('lend', () => {
    it('generates expected output (weth only)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const outgoingWethAmount = utils.parseEther('2');
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForMethod(
        lendSelector,
        curveSethLendArgs({
          outgoingWethAmount,
          outgoingSethAmount: BigNumber.from(0),
          minIncomingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth],
        spendAssetAmounts_: [outgoingWethAmount],
        incomingAssets_: [fork.config.curve.pools.seth.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
      });
    });

    it('generates expected output (seth only)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const outgoingSethAmount = utils.parseEther('2');
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForMethod(
        lendSelector,
        curveSethLendArgs({
          outgoingWethAmount: BigNumber.from(0),
          outgoingSethAmount,
          minIncomingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.synthetix.synths.seth],
        spendAssetAmounts_: [outgoingSethAmount],
        incomingAssets_: [fork.config.curve.pools.seth.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
      });
    });

    it('generates expected output (both assets)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const outgoingWethAmount = utils.parseEther('3');
      const outgoingSethAmount = utils.parseEther('2');
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForMethod(
        lendSelector,
        curveSethLendArgs({
          outgoingWethAmount,
          outgoingSethAmount,
          minIncomingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth, fork.config.synthetix.synths.seth],
        spendAssetAmounts_: [outgoingWethAmount, outgoingSethAmount],
        incomingAssets_: [fork.config.curve.pools.seth.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
      });
    });
  });

  describe('lendAndStake', () => {
    it('generates expected output (weth only)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const outgoingWethAmount = utils.parseEther('2');
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForMethod(
        lendAndStakeSelector,
        curveSethLendAndStakeArgs({
          outgoingWethAmount,
          outgoingSethAmount: BigNumber.from(0),
          minIncomingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth],
        spendAssetAmounts_: [outgoingWethAmount],
        incomingAssets_: [fork.config.curve.pools.seth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
      });
    });

    it('generates expected output (seth only)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const outgoingSethAmount = utils.parseEther('2');
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForMethod(
        lendAndStakeSelector,
        curveSethLendAndStakeArgs({
          outgoingWethAmount: BigNumber.from(0),
          outgoingSethAmount,
          minIncomingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.synthetix.synths.seth],
        spendAssetAmounts_: [outgoingSethAmount],
        incomingAssets_: [fork.config.curve.pools.seth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
      });
    });

    it('generates expected output (both assets)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const outgoingWethAmount = utils.parseEther('3');
      const outgoingSethAmount = utils.parseEther('2');
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForMethod(
        lendAndStakeSelector,
        curveSethLendAndStakeArgs({
          outgoingWethAmount,
          outgoingSethAmount,
          minIncomingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth, fork.config.synthetix.synths.seth],
        spendAssetAmounts_: [outgoingWethAmount, outgoingSethAmount],
        incomingAssets_: [fork.config.curve.pools.seth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
      });
    });
  });

  describe('redeem', () => {
    it('generates expected output (standard)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const minIncomingSethAmount = utils.parseEther('2');
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForMethod(
        redeemSelector,
        curveSethRedeemArgs({
          outgoingLPTokenAmount,
          minIncomingWethAmount,
          minIncomingSethAmount,
          receiveSingleAsset: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.seth.lpToken],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        incomingAssets_: [fork.config.weth, fork.config.synthetix.synths.seth],
        minIncomingAssetAmounts_: [minIncomingWethAmount, minIncomingSethAmount],
      });
    });

    it('generates expected output (single-asset: weth)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForMethod(
        redeemSelector,
        curveSethRedeemArgs({
          outgoingLPTokenAmount,
          minIncomingWethAmount,
          minIncomingSethAmount: BigNumber.from(0),
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.seth.lpToken],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        incomingAssets_: [fork.config.weth],
        minIncomingAssetAmounts_: [minIncomingWethAmount],
      });
    });

    it('generates expected output (single-asset: seth)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const minIncomingSethAmount = utils.parseEther('3');
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForMethod(
        redeemSelector,
        curveSethRedeemArgs({
          outgoingLPTokenAmount,
          minIncomingWethAmount: BigNumber.from(0),
          minIncomingSethAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.seth.lpToken],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        incomingAssets_: [fork.config.synthetix.synths.seth],
        minIncomingAssetAmounts_: [minIncomingSethAmount],
      });
    });
  });

  describe('stake', () => {
    it('generates expected output', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const outgoingLPTokenAmount = utils.parseEther('2');

      const result = await curveLiquiditySethAdapter.parseAssetsForMethod(
        stakeSelector,
        curveSethStakeArgs({
          outgoingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.seth.lpToken],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        incomingAssets_: [fork.config.curve.pools.seth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [outgoingLPTokenAmount],
      });
    });
  });

  describe('unstake', () => {
    it('generates expected output', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('2');

      const result = await curveLiquiditySethAdapter.parseAssetsForMethod(
        unstakeSelector,
        curveSethUnstakeArgs({
          outgoingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.seth.liquidityGaugeToken],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        incomingAssets_: [fork.config.curve.pools.seth.lpToken],
        minIncomingAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
      });
    });
  });

  describe('unstakeAndRedeem', () => {
    it('generates expected output (standard)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const minIncomingSethAmount = utils.parseEther('2');
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForMethod(
        unstakeAndRedeemSelector,
        curveSethUnstakeAndRedeemArgs({
          outgoingLiquidityGaugeTokenAmount,
          minIncomingWethAmount,
          minIncomingSethAmount,
          receiveSingleAsset: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.seth.liquidityGaugeToken],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        incomingAssets_: [fork.config.weth, fork.config.synthetix.synths.seth],
        minIncomingAssetAmounts_: [minIncomingWethAmount, minIncomingSethAmount],
      });
    });

    it('generates expected output (single-asset: weth)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForMethod(
        unstakeAndRedeemSelector,
        curveSethUnstakeAndRedeemArgs({
          outgoingLiquidityGaugeTokenAmount,
          minIncomingWethAmount,
          minIncomingSethAmount: BigNumber.from(0),
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.seth.liquidityGaugeToken],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        incomingAssets_: [fork.config.weth],
        minIncomingAssetAmounts_: [minIncomingWethAmount],
      });
    });

    it('generates expected output (single-asset: seth)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const minIncomingSethAmount = utils.parseEther('3');
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForMethod(
        unstakeAndRedeemSelector,
        curveSethUnstakeAndRedeemArgs({
          outgoingLiquidityGaugeTokenAmount,
          minIncomingWethAmount: BigNumber.from(0),
          minIncomingSethAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.seth.liquidityGaugeToken],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        incomingAssets_: [fork.config.synthetix.synths.seth],
        minIncomingAssetAmounts_: [minIncomingSethAmount],
      });
    });
  });
});

describe('lend', () => {
  it('works as expected (with only weth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lpToken = new StandardToken(fork.config.curve.pools.seth.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));

    const preTxWethBalance = await weth.balanceOf(vaultProxy);

    await curveSethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingWethAmount,
      outgoingSethAmount: BigNumber.from(0),
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    const [postTxWethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxWethBalance).toEqBigNumber(preTxWethBalance.sub(outgoingWethAmount));
    // TODO: get expected incoming amount
    expect(postTxLpTokenBalance).toBeGtBigNumber(0);
  });

  it('works as expected (with only seth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
    const seth = new StandardToken(fork.config.synthetix.synths.seth, whales.seth);
    const lpToken = new StandardToken(fork.config.curve.pools.seth.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    const outgoingSethAmount = utils.parseEther('2');

    const preTxSethBalance = outgoingSethAmount.mul(2);

    // Seed fund with a surplus of seth
    await seth.transfer(vaultProxy, preTxSethBalance);

    await curveSethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingWethAmount: BigNumber.from(0),
      outgoingSethAmount,
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    const [postTxSethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [seth, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxSethBalance).toEqBigNumber(preTxSethBalance.sub(outgoingSethAmount));
    // TODO: get expected incoming amount
    expect(postTxLpTokenBalance).toBeGtBigNumber(0);
  });

  it('works as expected (with an imbalance of weth and seth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const seth = new StandardToken(fork.config.synthetix.synths.seth, whales.seth);
    const lpToken = new StandardToken(fork.config.curve.pools.seth.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    const outgoingWethAmount = utils.parseEther('0.5');
    const outgoingSethAmount = utils.parseEther('2');

    // TODO: the test runner has some weird behavior where the stETH balance here
    // is reporting 1 wei less than it should be, if queried directly
    const preTxWethBalance = outgoingWethAmount.mul(2);
    const preTxSethBalance = outgoingSethAmount.mul(2);

    // Seed fund with a surplus of weth and seth
    await weth.transfer(vaultProxy, preTxWethBalance);
    await seth.transfer(vaultProxy, preTxSethBalance);

    await curveSethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingWethAmount,
      outgoingSethAmount,
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    const [postTxWethBalance, postTxSethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, seth, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxWethBalance).toEqBigNumber(preTxWethBalance.sub(outgoingWethAmount));
    expect(postTxSethBalance).toEqBigNumber(preTxSethBalance.sub(outgoingSethAmount));
    // TODO: get expected incoming amount
    expect(postTxLpTokenBalance).toBeGtBigNumber(0);
  });
});

describe('lendAndStake', () => {
  it('works as expected (with only weth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.seth.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));

    const preTxWethBalance = await weth.balanceOf(vaultProxy);

    await curveSethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingWethAmount,
      outgoingSethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    const [postTxWethBalance, postTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, liquidityGaugeToken],
    });

    // Assert the amounts of spent and received
    expect(postTxWethBalance).toEqBigNumber(preTxWethBalance.sub(outgoingWethAmount));
    // TODO: get expected incoming amount
    expect(postTxLiquidityGaugeTokenBalance).toBeGtBigNumber(0);
  });

  it('works as expected (with only seth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
    const seth = new StandardToken(fork.config.synthetix.synths.seth, whales.seth);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.seth.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Seed fund with a surplus of seth
    const outgoingSethAmount = utils.parseEther('2');

    // TODO: the test runner has some weird behavior where the stETH balance here
    // is reporting 1 wei less than it should be, if queried directly
    const preTxSethBalance = outgoingSethAmount.mul(2);

    // Seed fund with a surplus of seth
    await seth.transfer(vaultProxy, preTxSethBalance);

    await curveSethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingWethAmount: BigNumber.from(0),
      outgoingSethAmount,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    const [postTxSethBalance, postTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [seth, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxSethBalance).toEqBigNumber(preTxSethBalance.sub(outgoingSethAmount));
    // TODO: get expected incoming amount
    expect(postTxLiquidityGaugeTokenBalance).toBeGtBigNumber(0);
  });

  it('works as expected (with an imbalance of weth and seth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
    const seth = new StandardToken(fork.config.synthetix.synths.seth, whales.seth);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.seth.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and seth
    const outgoingWethAmount = utils.parseEther('3');
    const outgoingSethAmount = utils.parseEther('2');

    // TODO: the test runner has some weird behavior where the stETH balance here
    // is reporting 1 wei less than it should be, if queried directly
    const preTxWethBalance = outgoingWethAmount.mul(2);
    const preTxSethBalance = outgoingSethAmount.mul(2);

    // Seed fund with a surplus of weth and seth
    await weth.transfer(vaultProxy, preTxWethBalance);
    await seth.transfer(vaultProxy, preTxSethBalance);

    await curveSethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingWethAmount,
      outgoingSethAmount,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    const [postTxWethBalance, postTxSethBalance, postTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, seth, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxWethBalance).toEqBigNumber(preTxWethBalance.sub(outgoingWethAmount));
    expect(postTxSethBalance).toEqBigNumber(preTxSethBalance.sub(outgoingSethAmount));
    // TODO: get expected incoming amount
    expect(postTxLiquidityGaugeTokenBalance).toBeGtBigNumber(0);
  });
});

describe('redeem', () => {
  it('works as expected (standard)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
    const seth = new StandardToken(fork.config.synthetix.synths.seth, provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lpToken = new StandardToken(fork.config.curve.pools.seth.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveSethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingWethAmount,
      outgoingSethAmount: BigNumber.from(0),
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    const [preTxWethBalance, preTxSethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, seth, lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    await curveSethRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingLPTokenAmount,
      minIncomingWethAmount: BigNumber.from(1),
      minIncomingSethAmount: BigNumber.from(1),
      receiveSingleAsset: false,
    });

    const [postTxWethBalance, postTxSethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, seth, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLPTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxWethBalance).toBeGtBigNumber(preTxWethBalance);
    expect(postTxSethBalance).toBeGtBigNumber(preTxSethBalance);
  });

  it('works as expected (single-asset: weth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
    const seth = new StandardToken(fork.config.synthetix.synths.seth, provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lpToken = new StandardToken(fork.config.curve.pools.seth.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveSethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingWethAmount,
      outgoingSethAmount: BigNumber.from(0),
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    const [preTxWethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    await curveSethRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingLPTokenAmount,
      minIncomingWethAmount: BigNumber.from(1),
      minIncomingSethAmount: BigNumber.from(0),
      receiveSingleAsset: true,
    });

    const [postTxWethBalance, postTxSethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, seth, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLPTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxWethBalance).toBeGtBigNumber(preTxWethBalance);
    // STETH balance should be unchanged
    expect(postTxSethBalance).toEqBigNumber(0);
  });

  it('works as expected (single-asset: seth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
    const seth = new StandardToken(fork.config.synthetix.synths.seth, provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lpToken = new StandardToken(fork.config.curve.pools.seth.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveSethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingWethAmount,
      outgoingSethAmount: BigNumber.from(0),
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    const [preTxWethBalance, preTxSethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, seth, lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    await curveSethRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingLPTokenAmount,
      minIncomingWethAmount: BigNumber.from(0),
      minIncomingSethAmount: BigNumber.from(1),
      receiveSingleAsset: true,
    });

    const [postTxWethBalance, postTxSethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, seth, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLPTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxSethBalance).toBeGtBigNumber(preTxSethBalance);
    // WETH balance should be unchanged
    expect(postTxWethBalance).toEqBigNumber(preTxWethBalance);
  });
});

describe('unstakeAndRedeem', () => {
  it('works as expected (standard)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
    const seth = new StandardToken(fork.config.synthetix.synths.seth, provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.seth.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and lend and stake for liquidity gauge tokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveSethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingWethAmount,
      outgoingSethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    const [preTxWethBalance, preTxSethBalance, preTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, seth, liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLiquidityGaugeTokenBalance.div(2);

    await curveSethUnstakeAndRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingLiquidityGaugeTokenAmount,
      minIncomingWethAmount: BigNumber.from(1),
      minIncomingSethAmount: BigNumber.from(1),
      receiveSingleAsset: false,
    });

    const [postTxWethBalance, postTxSethBalance, postTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, seth, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxLiquidityGaugeTokenBalance).toEqBigNumber(
      preTxLiquidityGaugeTokenBalance.sub(outgoingLiquidityGaugeTokenAmount),
    );
    // TODO: get expected incoming amounts
    expect(postTxWethBalance).toBeGtBigNumber(preTxWethBalance);
    expect(postTxSethBalance).toBeGtBigNumber(preTxSethBalance);
  });

  it('works as expected (single-asset: weth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
    const seth = new StandardToken(fork.config.synthetix.synths.seth, provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.seth.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveSethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingWethAmount,
      outgoingSethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    const [preTxWethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLpTokenBalance.div(2);

    await curveSethUnstakeAndRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingLiquidityGaugeTokenAmount,
      minIncomingWethAmount: BigNumber.from(1),
      minIncomingSethAmount: BigNumber.from(0),
      receiveSingleAsset: true,
    });

    const [postTxWethBalance, postTxSethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, seth, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLiquidityGaugeTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxWethBalance).toBeGtBigNumber(preTxWethBalance);
    // STETH balance should be unchanged
    expect(postTxSethBalance).toEqBigNumber(0);
  });

  it('works as expected (single-asset: seth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
    const seth = new StandardToken(fork.config.synthetix.synths.seth, provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.seth.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveSethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingWethAmount,
      outgoingSethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    const [preTxWethBalance, preTxSethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, seth, liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLpTokenBalance.div(2);

    await curveSethUnstakeAndRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingLiquidityGaugeTokenAmount,
      minIncomingWethAmount: BigNumber.from(0),
      minIncomingSethAmount: BigNumber.from(1),
      receiveSingleAsset: true,
    });

    const [postTxWethBalance, postTxSethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, seth, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLiquidityGaugeTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxSethBalance).toBeGtBigNumber(preTxSethBalance);
    // WETH balance should be unchanged
    expect(postTxWethBalance).toEqBigNumber(preTxWethBalance);
  });
});

describe('stake and unstake', () => {
  it('correctly handles staking and then unstaking partial balances', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.seth.liquidityGaugeToken, provider);
    const lpToken = new StandardToken(fork.config.curve.pools.seth.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // First, acquire some lpTokens by lending on Curve
    // Seed fund with a surplus of weth
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveSethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingWethAmount,
      outgoingSethAmount: BigNumber.from(0),
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    // Stake the LP tokens
    const preStakeTxLpTokenBalance = await lpToken.balanceOf(vaultProxy);
    const stakeLPTokenAmount = preStakeTxLpTokenBalance.div(2);

    await curveSethStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
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
    await curveSethUnstake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
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

describe('claimRewards', () => {
  it('claims CRV and pool token rewards, which land in the vault', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
    const crv = new StandardToken(fork.config.primitives.crv, provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Lend and stake to start accruing rewards
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount);
    await curveSethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingWethAmount,
      outgoingSethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    // TODO: check if call fails if no rewards available

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);

    const [preClaimRewardsCrvBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv],
    });

    // Approve the adapter to claim $CRV rewards on behalf of the vault
    await vaultCallCurveMinterToggleApproveMint({
      comptrollerProxy,
      minter: fork.config.curve.minter,
      account: curveLiquiditySethAdapter,
    });

    // Claim all earned rewards
    await curveSethClaimRewards({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
    });

    const [postClaimRewardsCrvBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv],
    });

    // Assert vault balances of reward tokens have increased
    expect(postClaimRewardsCrvBalance).toBeGtBigNumber(preClaimRewardsCrvBalance);
  });
});

describe('claimRewardsAndReinvest', () => {
  it('claimed amounts only: claim rewards and then reinvests only the amounts claimed of each reward token', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
    const integrationManager = fork.deployment.integrationManager;
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.seth.liquidityGaugeToken, provider);
    const crv = new StandardToken(fork.config.primitives.crv, whales.crv);
    const weth = new StandardToken(fork.config.weth, whales.weth);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Lend and stake to start accruing rewards
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount);
    await curveSethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingWethAmount,
      outgoingSethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);

    // Send some balances of the rewards assets to the vault
    await crv.transfer(vaultProxy, utils.parseEther('2'));

    const [preClaimRewardsCrvBalance, preClaimRewardsLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv, liquidityGaugeToken],
    });

    // Assert rewards tokens start with non-0 balances
    expect(preClaimRewardsCrvBalance).toBeGtBigNumber(0);

    // Approve the adapter to claim $CRV rewards on behalf of the vault
    await vaultCallCurveMinterToggleApproveMint({
      comptrollerProxy,
      minter: fork.config.curve.minter,
      account: curveLiquiditySethAdapter,
    });

    // Approve the adapter to use CRV
    await curveApproveAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      adapter: curveLiquiditySethAdapter,
      assets: [fork.config.primitives.crv],
    });

    // Claim all earned rewards
    await curveSethClaimRewardsAndReinvest({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      useFullBalances: false,
    });

    const [postClaimRewardsCrvBalance, postClaimRewardsLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv, liquidityGaugeToken],
    });

    // Assert only the newly claimed balances of reward tokens were used
    expect(postClaimRewardsCrvBalance).toEqBigNumber(preClaimRewardsCrvBalance);

    // Assert no rewards tokens are remaining in the adapter
    expect(await crv.balanceOf(curveLiquiditySethAdapter)).toEqBigNumber(0);

    // Assert the amount of liquidity gauge tokens in the vault increased
    expect(postClaimRewardsLiquidityGaugeTokenBalance).toBeGtBigNumber(preClaimRewardsLiquidityGaugeTokenBalance);
  });

  it('full balances: claim rewards and then reinvests the full vault balances of each reward token', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
    const integrationManager = fork.deployment.integrationManager;
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.seth.liquidityGaugeToken, provider);
    const crv = new StandardToken(fork.config.primitives.crv, whales.crv);
    const weth = new StandardToken(fork.config.weth, whales.weth);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Lend and stake to start accruing rewards
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount);
    await curveSethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingWethAmount,
      outgoingSethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);

    // Send some balances of the rewards assets to the vault
    await crv.transfer(vaultProxy, utils.parseEther('2'));

    const [preClaimRewardsCrvBalance, preClaimRewardsLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv, liquidityGaugeToken],
    });

    // Assert rewards tokens start with non-0 balances
    expect(preClaimRewardsCrvBalance).toBeGtBigNumber(0);

    // Approve the adapter to claim $CRV rewards on behalf of the vault
    await vaultCallCurveMinterToggleApproveMint({
      comptrollerProxy,
      minter: fork.config.curve.minter,
      account: curveLiquiditySethAdapter,
    });

    // Approve the adapter to use CRV
    await curveApproveAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      adapter: curveLiquiditySethAdapter,
      assets: [fork.config.primitives.crv],
    });

    // Claim all earned rewards
    await curveSethClaimRewardsAndReinvest({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      useFullBalances: true,
    });

    const [postClaimRewardsCrvBalance, postClaimRewardsLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv, liquidityGaugeToken],
    });

    // Assert entire vault balances of reward tokens were used
    expect(postClaimRewardsCrvBalance).toEqBigNumber(0);

    // Assert no rewards tokens are remaining in the adapter
    expect(await crv.balanceOf(curveLiquiditySethAdapter)).toEqBigNumber(0);

    // Assert the amount of liquidity gauge tokens in the vault increased
    expect(postClaimRewardsLiquidityGaugeTokenBalance).toBeGtBigNumber(preClaimRewardsLiquidityGaugeTokenBalance);
  });
});

describe('claimRewardsAndSwap', () => {
  it('claimed amounts only: claim rewards and swaps only the amounts claimed of each reward token (into WETH)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
    const integrationManager = fork.deployment.integrationManager;
    const crv = new StandardToken(fork.config.primitives.crv, whales.crv);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const incomingAsset = weth;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Lend and stake to start accruing rewards
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount);
    await curveSethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingWethAmount,
      outgoingSethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);

    // Send some balances of the rewards assets to the vault
    await crv.transfer(vaultProxy, utils.parseEther('2'));

    const [preClaimRewardsCrvBalance, preClaimRewardsIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv, incomingAsset],
    });

    // Assert rewards tokens start with non-0 balances
    expect(preClaimRewardsCrvBalance).toBeGtBigNumber(0);

    // Approve the adapter to claim $CRV rewards on behalf of the vault
    await vaultCallCurveMinterToggleApproveMint({
      comptrollerProxy,
      minter: fork.config.curve.minter,
      account: curveLiquiditySethAdapter,
    });

    // Approve the adapter to use CRV
    await curveApproveAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      adapter: curveLiquiditySethAdapter,
      assets: [fork.config.primitives.crv],
    });

    // Claim all earned rewards and swap for the specified incoming asset
    await curveSethClaimRewardsAndSwap({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      useFullBalances: false,
      incomingAsset: incomingAsset,
    });

    const [postClaimRewardsCrvBalance, postClaimRewardsIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv, incomingAsset],
    });

    // Assert only the newly claimed balances of reward tokens were used
    expect(postClaimRewardsCrvBalance).toEqBigNumber(preClaimRewardsCrvBalance);

    // Assert no rewards tokens are remaining in the adapter
    expect(await crv.balanceOf(curveLiquiditySethAdapter)).toEqBigNumber(0);

    // Assert the amount of incoming asset in the vault increased
    expect(postClaimRewardsIncomingAssetBalance).toBeGtBigNumber(preClaimRewardsIncomingAssetBalance);
  });

  it('full balances: claim rewards and swaps the full vault balances of each reward token (into DAI)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
    const integrationManager = fork.deployment.integrationManager;
    const crv = new StandardToken(fork.config.primitives.crv, whales.crv);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const incomingAsset = new StandardToken(fork.config.primitives.dai, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Lend and stake to start accruing rewards
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount);
    await curveSethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      outgoingWethAmount,
      outgoingSethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);

    // Send some balances of the rewards assets to the vault
    await crv.transfer(vaultProxy, utils.parseEther('2'));

    const [preClaimRewardsCrvBalance, preClaimRewardsIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv, incomingAsset],
    });

    // Assert rewards tokens start with non-0 balances
    expect(preClaimRewardsCrvBalance).toBeGtBigNumber(0);

    // Approve the adapter to claim $CRV rewards on behalf of the vault
    await vaultCallCurveMinterToggleApproveMint({
      comptrollerProxy,
      minter: fork.config.curve.minter,
      account: curveLiquiditySethAdapter,
    });

    // Approve the adapter to use CRV
    await curveApproveAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      adapter: curveLiquiditySethAdapter,
      assets: [fork.config.primitives.crv],
    });

    // Claim all earned rewards and swap for the specified incoming asset
    await curveSethClaimRewardsAndSwap({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      curveLiquiditySethAdapter,
      useFullBalances: true,
      incomingAsset,
    });

    const [postClaimRewardsCrvBalance, postClaimRewardsIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv, incomingAsset],
    });

    // Assert entire vault balances of reward tokens were used
    expect(postClaimRewardsCrvBalance).toEqBigNumber(0);

    // Assert no rewards tokens are remaining in the adapter
    expect(await crv.balanceOf(curveLiquiditySethAdapter)).toEqBigNumber(0);

    // Assert the amount of incoming asset in the vault increased
    expect(postClaimRewardsIncomingAssetBalance).toBeGtBigNumber(preClaimRewardsIncomingAssetBalance);
  });
});
