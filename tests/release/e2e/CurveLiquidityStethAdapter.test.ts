import { randomAddress } from '@enzymefinance/ethers';
import {
  approveAssetsSelector,
  claimRewardsAndReinvestSelector,
  claimRewardsAndSwapSelector,
  claimRewardsSelector,
  curveApproveAssetsArgs,
  curveStethClaimRewardsAndReinvestArgs,
  curveStethClaimRewardsAndSwapArgs,
  curveStethLendArgs,
  curveStethLendAndStakeArgs,
  curveStethRedeemArgs,
  curveStethStakeArgs,
  curveStethUnstakeArgs,
  curveStethUnstakeAndRedeemArgs,
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
  CurveLiquidityGaugeV2,
  CurveMinter,
  curveStethClaimRewards,
  curveStethClaimRewardsAndReinvest,
  curveStethClaimRewardsAndSwap,
  curveStethLend,
  curveStethLendAndStake,
  curveStethRedeem,
  curveStethStake,
  curveStethUnstake,
  curveStethUnstakeAndRedeem,
  deployProtocolFixture,
  getAssetBalances,
  ProtocolDeployment,
  vaultCallCurveMinterMint,
  vaultCallCurveMinterMintMany,
  vaultCallCurveMinterToggleApproveMint,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

let ldo: StandardToken;
let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
  ldo = new StandardToken('0x5a98fcbea516cf06857215779fd812ca3bef1b32', whales.ldo);
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;

    expect(await curveLiquidityStethAdapter.getLpToken()).toMatchAddress(fork.config.curve.pools.steth.lpToken);
    expect(await curveLiquidityStethAdapter.getLiquidityGaugeToken()).toMatchAddress(
      fork.config.curve.pools.steth.liquidityGaugeToken,
    );
    expect(await curveLiquidityStethAdapter.getStethToken()).toMatchAddress(fork.config.lido.steth);

    // AdapterBase
    expect(await curveLiquidityStethAdapter.getIntegrationManager()).toMatchAddress(fork.deployment.integrationManager);

    // CurveGaugeV2RewardsHandlerBase
    expect(await curveLiquidityStethAdapter.getCurveGaugeV2RewardsHandlerCrvToken()).toMatchAddress(
      fork.config.primitives.crv,
    );
    expect(await curveLiquidityStethAdapter.getCurveGaugeV2RewardsHandlerMinter()).toMatchAddress(
      fork.config.curve.minter,
    );

    // CurveStethLiquidityActionsMixin
    expect(await curveLiquidityStethAdapter.getCurveStethLiquidityPool()).toMatchAddress(
      fork.config.curve.pools.steth.pool,
    );
    expect(await curveLiquidityStethAdapter.getCurveStethLiquidityWethToken()).toMatchAddress(fork.config.weth);

    // UniswapV2ActionsMixin
    expect(await curveLiquidityStethAdapter.getUniswapV2Router2()).toMatchAddress(fork.config.uniswap.router);
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;

    await expect(
      curveLiquidityStethAdapter.parseAssetsForMethod(utils.randomBytes(4), constants.HashZero),
    ).rejects.toBeRevertedWith('_selector invalid');
  });

  describe('approveAssets', () => {
    it('does not allow unequal input arrays', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;

      await expect(
        curveLiquidityStethAdapter.parseAssetsForMethod(
          approveAssetsSelector,
          curveApproveAssetsArgs({
            assets: [randomAddress(), randomAddress()],
            amounts: [1],
          }),
        ),
      ).rejects.toBeRevertedWith('Unequal arrays');
    });

    it('does not allow an asset that is not a rewards token (with an amount >0)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;

      await expect(
        curveLiquidityStethAdapter.parseAssetsForMethod(
          approveAssetsSelector,
          curveApproveAssetsArgs({
            assets: [randomAddress()],
            amounts: [1],
          }),
        ),
      ).rejects.toBeRevertedWith('Invalid reward token');
    });

    it('generates expected output', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;

      // Random address should be allowed since amount is 0
      const assets = [fork.config.primitives.crv, randomAddress()];
      const amounts = [1, 0];
      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        approveAssetsSelector,
        curveApproveAssetsArgs({
          assets,
          amounts,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
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
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(claimRewardsSelector, constants.HashZero);

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
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
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('2');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        claimRewardsAndReinvestSelector,
        curveStethClaimRewardsAndReinvestArgs({
          useFullBalances: true, // Does not matter
          minIncomingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.None,
        spendAssets_: [],
        spendAssetAmounts_: [],
        incomingAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
      });
    });
  });

  describe('claimRewardsAndSwap', () => {
    it('generates expected output', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const incomingAsset = randomAddress();
      const minIncomingAssetAmount = utils.parseEther('2');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        claimRewardsAndSwapSelector,
        curveStethClaimRewardsAndSwapArgs({
          useFullBalances: true, // Does not matter
          incomingAsset,
          minIncomingAssetAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
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
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const outgoingWethAmount = utils.parseEther('2');
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        lendSelector,
        curveStethLendArgs({
          outgoingWethAmount,
          outgoingStethAmount: BigNumber.from(0),
          minIncomingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth],
        spendAssetAmounts_: [outgoingWethAmount],
        incomingAssets_: [fork.config.curve.pools.steth.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
      });
    });

    it('generates expected output (steth only)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const outgoingStethAmount = utils.parseEther('2');
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        lendSelector,
        curveStethLendArgs({
          outgoingWethAmount: BigNumber.from(0),
          outgoingStethAmount,
          minIncomingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.lido.steth],
        spendAssetAmounts_: [outgoingStethAmount],
        incomingAssets_: [fork.config.curve.pools.steth.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
      });
    });

    it('generates expected output (both assets)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const outgoingWethAmount = utils.parseEther('3');
      const outgoingStethAmount = utils.parseEther('2');
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        lendSelector,
        curveStethLendArgs({
          outgoingWethAmount,
          outgoingStethAmount,
          minIncomingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth, fork.config.lido.steth],
        spendAssetAmounts_: [outgoingWethAmount, outgoingStethAmount],
        incomingAssets_: [fork.config.curve.pools.steth.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
      });
    });
  });

  describe('lendAndStake', () => {
    it('generates expected output (weth only)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const outgoingWethAmount = utils.parseEther('2');
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        lendAndStakeSelector,
        curveStethLendAndStakeArgs({
          outgoingWethAmount,
          outgoingStethAmount: BigNumber.from(0),
          minIncomingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth],
        spendAssetAmounts_: [outgoingWethAmount],
        incomingAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
      });
    });

    it('generates expected output (steth only)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const outgoingStethAmount = utils.parseEther('2');
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        lendAndStakeSelector,
        curveStethLendAndStakeArgs({
          outgoingWethAmount: BigNumber.from(0),
          outgoingStethAmount,
          minIncomingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.lido.steth],
        spendAssetAmounts_: [outgoingStethAmount],
        incomingAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
      });
    });

    it('generates expected output (both assets)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const outgoingWethAmount = utils.parseEther('3');
      const outgoingStethAmount = utils.parseEther('2');
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        lendAndStakeSelector,
        curveStethLendAndStakeArgs({
          outgoingWethAmount,
          outgoingStethAmount,
          minIncomingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth, fork.config.lido.steth],
        spendAssetAmounts_: [outgoingWethAmount, outgoingStethAmount],
        incomingAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
      });
    });
  });

  describe('redeem', () => {
    it('generates expected output (standard)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const minIncomingStethAmount = utils.parseEther('2');
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        redeemSelector,
        curveStethRedeemArgs({
          outgoingLPTokenAmount,
          minIncomingWethAmount,
          minIncomingStethAmount,
          receiveSingleAsset: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.lpToken],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        incomingAssets_: [fork.config.weth, fork.config.lido.steth],
        minIncomingAssetAmounts_: [minIncomingWethAmount, minIncomingStethAmount],
      });
    });

    it('generates expected output (single-asset: weth)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        redeemSelector,
        curveStethRedeemArgs({
          outgoingLPTokenAmount,
          minIncomingWethAmount,
          minIncomingStethAmount: BigNumber.from(0),
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.lpToken],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        incomingAssets_: [fork.config.weth],
        minIncomingAssetAmounts_: [minIncomingWethAmount],
      });
    });

    it('generates expected output (single-asset: steth)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const minIncomingStethAmount = utils.parseEther('3');
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        redeemSelector,
        curveStethRedeemArgs({
          outgoingLPTokenAmount,
          minIncomingWethAmount: BigNumber.from(0),
          minIncomingStethAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.lpToken],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        incomingAssets_: [fork.config.lido.steth],
        minIncomingAssetAmounts_: [minIncomingStethAmount],
      });
    });
  });

  describe('stake', () => {
    it('generates expected output', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const outgoingLPTokenAmount = utils.parseEther('2');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        stakeSelector,
        curveStethStakeArgs({
          outgoingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.lpToken],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        incomingAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [outgoingLPTokenAmount],
      });
    });
  });

  describe('unstake', () => {
    it('generates expected output', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('2');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        unstakeSelector,
        curveStethUnstakeArgs({
          outgoingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        incomingAssets_: [fork.config.curve.pools.steth.lpToken],
        minIncomingAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
      });
    });
  });

  describe('unstakeAndRedeem', () => {
    it('generates expected output (standard)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const minIncomingStethAmount = utils.parseEther('2');
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        unstakeAndRedeemSelector,
        curveStethUnstakeAndRedeemArgs({
          outgoingLiquidityGaugeTokenAmount,
          minIncomingWethAmount,
          minIncomingStethAmount,
          receiveSingleAsset: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        incomingAssets_: [fork.config.weth, fork.config.lido.steth],
        minIncomingAssetAmounts_: [minIncomingWethAmount, minIncomingStethAmount],
      });
    });

    it('generates expected output (single-asset: weth)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        unstakeAndRedeemSelector,
        curveStethUnstakeAndRedeemArgs({
          outgoingLiquidityGaugeTokenAmount,
          minIncomingWethAmount,
          minIncomingStethAmount: BigNumber.from(0),
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        incomingAssets_: [fork.config.weth],
        minIncomingAssetAmounts_: [minIncomingWethAmount],
      });
    });

    it('generates expected output (single-asset: steth)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const minIncomingStethAmount = utils.parseEther('3');
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        unstakeAndRedeemSelector,
        curveStethUnstakeAndRedeemArgs({
          outgoingLiquidityGaugeTokenAmount,
          minIncomingWethAmount: BigNumber.from(0),
          minIncomingStethAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        incomingAssets_: [fork.config.lido.steth],
        minIncomingAssetAmounts_: [minIncomingStethAmount],
      });
    });
  });
});

describe('lend', () => {
  it('works as expected (with only weth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, provider);

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

    await curveStethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
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

  it('works as expected (with only steth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, whales.lidoSteth);
    const lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    const outgoingStethAmount = utils.parseEther('2');

    // TODO: the test runner has some weird behavior where the stETH balance here
    // is reporting 1 wei less than it should be, if queried directly
    const preTxStethBalance = outgoingStethAmount.mul(2);

    // Seed fund with a surplus of steth
    await steth.transfer(vaultProxy, preTxStethBalance);

    await curveStethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount: BigNumber.from(0),
      outgoingStethAmount,
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    const [postTxStethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [steth, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxStethBalance).toEqBigNumber(preTxStethBalance.sub(outgoingStethAmount));
    // TODO: get expected incoming amount
    expect(postTxLpTokenBalance).toBeGtBigNumber(0);
  });

  it('works as expected (with an imbalance of weth and steth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const steth = new StandardToken(fork.config.lido.steth, whales.lidoSteth);
    const lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    const outgoingWethAmount = utils.parseEther('0.5');
    const outgoingStethAmount = utils.parseEther('2');

    // TODO: the test runner has some weird behavior where the stETH balance here
    // is reporting 1 wei less than it should be, if queried directly
    const preTxWethBalance = outgoingWethAmount.mul(2);
    const preTxStethBalance = outgoingStethAmount.mul(2);

    // Seed fund with a surplus of weth and steth
    await weth.transfer(vaultProxy, preTxWethBalance);
    await steth.transfer(vaultProxy, preTxStethBalance);

    await curveStethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount,
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    const [postTxWethBalance, postTxStethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxWethBalance).toEqBigNumber(preTxWethBalance.sub(outgoingWethAmount));
    expect(postTxStethBalance).toEqBigNumber(preTxStethBalance.sub(outgoingStethAmount));
    // TODO: get expected incoming amount
    expect(postTxLpTokenBalance).toBeGtBigNumber(0);
  });
});

describe('lendAndStake', () => {
  it('works as expected (with only weth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.steth.liquidityGaugeToken, provider);

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

    await curveStethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
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

  it('works as expected (with only steth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, whales.lidoSteth);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.steth.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Seed fund with a surplus of steth
    const outgoingStethAmount = utils.parseEther('2');

    // TODO: the test runner has some weird behavior where the stETH balance here
    // is reporting 1 wei less than it should be, if queried directly
    const preTxStethBalance = outgoingStethAmount.mul(2);

    // Seed fund with a surplus of steth
    await steth.transfer(vaultProxy, preTxStethBalance);

    await curveStethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount: BigNumber.from(0),
      outgoingStethAmount,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    const [postTxStethBalance, postTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [steth, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxStethBalance).toEqBigNumber(preTxStethBalance.sub(outgoingStethAmount));
    // TODO: get expected incoming amount
    expect(postTxLiquidityGaugeTokenBalance).toBeGtBigNumber(0);
  });

  it('works as expected (with an imbalance of weth and steth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, whales.lidoSteth);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.steth.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and steth
    const outgoingWethAmount = utils.parseEther('3');
    const outgoingStethAmount = utils.parseEther('2');

    // TODO: the test runner has some weird behavior where the stETH balance here
    // is reporting 1 wei less than it should be, if queried directly
    const preTxWethBalance = outgoingWethAmount.mul(2);
    const preTxStethBalance = outgoingStethAmount.mul(2);

    // Seed fund with a surplus of weth and steth
    await weth.transfer(vaultProxy, preTxWethBalance);
    await steth.transfer(vaultProxy, preTxStethBalance);

    await curveStethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    const [postTxWethBalance, postTxStethBalance, postTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxWethBalance).toEqBigNumber(preTxWethBalance.sub(outgoingWethAmount));
    expect(postTxStethBalance).toEqBigNumber(preTxStethBalance.sub(outgoingStethAmount));
    // TODO: get expected incoming amount
    expect(postTxLiquidityGaugeTokenBalance).toBeGtBigNumber(0);
  });
});

describe('redeem', () => {
  it('works as expected (standard)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    const [preTxWethBalance, preTxStethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    await curveStethRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingLPTokenAmount,
      minIncomingWethAmount: BigNumber.from(1),
      minIncomingStethAmount: BigNumber.from(1),
      receiveSingleAsset: false,
    });

    const [postTxWethBalance, postTxStethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLPTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxWethBalance).toBeGtBigNumber(preTxWethBalance);
    expect(postTxStethBalance).toBeGtBigNumber(preTxStethBalance);
  });

  it('works as expected (single-asset: weth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    const [preTxWethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    await curveStethRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingLPTokenAmount,
      minIncomingWethAmount: BigNumber.from(1),
      minIncomingStethAmount: BigNumber.from(0),
      receiveSingleAsset: true,
    });

    const [postTxWethBalance, postTxStethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLPTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxWethBalance).toBeGtBigNumber(preTxWethBalance);
    // STETH balance should be unchanged
    expect(postTxStethBalance).toEqBigNumber(0);
  });

  it('works as expected (single-asset: steth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    const [preTxWethBalance, preTxStethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    await curveStethRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingLPTokenAmount,
      minIncomingWethAmount: BigNumber.from(0),
      minIncomingStethAmount: BigNumber.from(1),
      receiveSingleAsset: true,
    });

    const [postTxWethBalance, postTxStethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLPTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxStethBalance).toBeGtBigNumber(preTxStethBalance);
    // WETH balance should be unchanged
    expect(postTxWethBalance).toEqBigNumber(preTxWethBalance);
  });
});

describe('unstakeAndRedeem', () => {
  it('works as expected (standard)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.steth.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and lend and stake for liquidity gauge tokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    const [preTxWethBalance, preTxStethBalance, preTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLiquidityGaugeTokenBalance.div(2);

    await curveStethUnstakeAndRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingLiquidityGaugeTokenAmount,
      minIncomingWethAmount: BigNumber.from(1),
      minIncomingStethAmount: BigNumber.from(1),
      receiveSingleAsset: false,
    });

    const [postTxWethBalance, postTxStethBalance, postTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxLiquidityGaugeTokenBalance).toEqBigNumber(
      preTxLiquidityGaugeTokenBalance.sub(outgoingLiquidityGaugeTokenAmount),
    );
    // TODO: get expected incoming amounts
    expect(postTxWethBalance).toBeGtBigNumber(preTxWethBalance);
    expect(postTxStethBalance).toBeGtBigNumber(preTxStethBalance);
  });

  it('works as expected (single-asset: weth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.steth.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    const [preTxWethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLpTokenBalance.div(2);

    await curveStethUnstakeAndRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingLiquidityGaugeTokenAmount,
      minIncomingWethAmount: BigNumber.from(1),
      minIncomingStethAmount: BigNumber.from(0),
      receiveSingleAsset: true,
    });

    const [postTxWethBalance, postTxStethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLiquidityGaugeTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxWethBalance).toBeGtBigNumber(preTxWethBalance);
    // STETH balance should be unchanged
    expect(postTxStethBalance).toEqBigNumber(0);
  });

  it('works as expected (single-asset: steth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.steth.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    const [preTxWethBalance, preTxStethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLpTokenBalance.div(2);

    await curveStethUnstakeAndRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingLiquidityGaugeTokenAmount,
      minIncomingWethAmount: BigNumber.from(0),
      minIncomingStethAmount: BigNumber.from(1),
      receiveSingleAsset: true,
    });

    const [postTxWethBalance, postTxStethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLiquidityGaugeTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxStethBalance).toBeGtBigNumber(preTxStethBalance);
    // WETH balance should be unchanged
    expect(postTxWethBalance).toEqBigNumber(preTxWethBalance);
  });
});

describe('stake and unstake', () => {
  it('correctly handles staking and then unstaking partial balances', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.steth.liquidityGaugeToken, provider);
    const lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, provider);

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
    await curveStethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    // Stake the LP tokens
    const preStakeTxLpTokenBalance = await lpToken.balanceOf(vaultProxy);
    const stakeLPTokenAmount = preStakeTxLpTokenBalance.div(2);

    await curveStethStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
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
    await curveStethUnstake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
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
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
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
    await curveStethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    // TODO: check if call fails if no rewards available

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);

    const [preClaimRewardsCrvBalance, preClaimRewardsLdoBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv, ldo],
    });

    // Approve the adapter to claim $CRV rewards on behalf of the vault
    await vaultCallCurveMinterToggleApproveMint({
      comptrollerProxy,
      minter: fork.config.curve.minter,
      account: curveLiquidityStethAdapter,
    });

    // Claim all earned rewards
    await curveStethClaimRewards({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
    });

    const [postClaimRewardsCrvBalance, postClaimRewardsLdoBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv, ldo],
    });

    // Assert vault balances of reward tokens have increased
    expect(postClaimRewardsCrvBalance).toBeGtBigNumber(preClaimRewardsCrvBalance);
    expect(postClaimRewardsLdoBalance).toBeGtBigNumber(preClaimRewardsLdoBalance);
  });
});

describe('claimRewardsAndReinvest', () => {
  it('claimed amounts only: claim rewards and then reinvests only the amounts claimed of each reward token', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
    const integrationManager = fork.deployment.integrationManager;
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.steth.liquidityGaugeToken, provider);
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
    await curveStethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);

    // Send some balances of the rewards assets to the vault
    await crv.transfer(vaultProxy, utils.parseEther('2'));
    await ldo.transfer(vaultProxy, utils.parseEther('3'));

    const [preClaimRewardsCrvBalance, preClaimRewardsLdoBalance, preClaimRewardsLiquidityGaugeTokenBalance] =
      await getAssetBalances({
        account: vaultProxy,
        assets: [crv, ldo, liquidityGaugeToken],
      });

    // Assert rewards tokens start with non-0 balances
    expect(preClaimRewardsCrvBalance).toBeGtBigNumber(0);
    expect(preClaimRewardsLdoBalance).toBeGtBigNumber(0);

    // Approve the adapter to claim $CRV rewards on behalf of the vault
    await vaultCallCurveMinterToggleApproveMint({
      comptrollerProxy,
      minter: fork.config.curve.minter,
      account: curveLiquidityStethAdapter,
    });

    // Approve the adapter to use CRV and LDO
    await curveApproveAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      adapter: curveLiquidityStethAdapter,
      assets: [fork.config.primitives.crv, ldo],
    });

    // Claim all earned rewards
    await curveStethClaimRewardsAndReinvest({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      useFullBalances: false,
    });

    const [postClaimRewardsCrvBalance, postClaimRewardsLdoBalance, postClaimRewardsLiquidityGaugeTokenBalance] =
      await getAssetBalances({
        account: vaultProxy,
        assets: [crv, ldo, liquidityGaugeToken],
      });

    // Assert only the newly claimed balances of reward tokens were used
    expect(postClaimRewardsCrvBalance).toEqBigNumber(preClaimRewardsCrvBalance);
    expect(postClaimRewardsLdoBalance).toEqBigNumber(preClaimRewardsLdoBalance);

    // Assert no rewards tokens are remaining in the adapter
    expect(await crv.balanceOf(curveLiquidityStethAdapter)).toEqBigNumber(0);
    expect(await ldo.balanceOf(curveLiquidityStethAdapter)).toEqBigNumber(0);

    // Assert the amount of liquidity gauge tokens in the vault increased
    expect(postClaimRewardsLiquidityGaugeTokenBalance).toBeGtBigNumber(preClaimRewardsLiquidityGaugeTokenBalance);
  });

  it('full balances: claim rewards and then reinvests the full vault balances of each reward token', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
    const integrationManager = fork.deployment.integrationManager;
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.steth.liquidityGaugeToken, provider);
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
    await curveStethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);

    // Send some balances of the rewards assets to the vault
    await crv.transfer(vaultProxy, utils.parseEther('2'));
    await ldo.transfer(vaultProxy, utils.parseEther('3'));

    const [preClaimRewardsCrvBalance, preClaimRewardsLdoBalance, preClaimRewardsLiquidityGaugeTokenBalance] =
      await getAssetBalances({
        account: vaultProxy,
        assets: [crv, ldo, liquidityGaugeToken],
      });

    // Assert rewards tokens start with non-0 balances
    expect(preClaimRewardsCrvBalance).toBeGtBigNumber(0);
    expect(preClaimRewardsLdoBalance).toBeGtBigNumber(0);

    // Approve the adapter to claim $CRV rewards on behalf of the vault
    await vaultCallCurveMinterToggleApproveMint({
      comptrollerProxy,
      minter: fork.config.curve.minter,
      account: curveLiquidityStethAdapter,
    });

    // Approve the adapter to use CRV and LDO
    await curveApproveAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      adapter: curveLiquidityStethAdapter,
      assets: [fork.config.primitives.crv, ldo],
    });

    // Claim all earned rewards
    await curveStethClaimRewardsAndReinvest({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      useFullBalances: true,
    });

    const [postClaimRewardsCrvBalance, postClaimRewardsLdoBalance, postClaimRewardsLiquidityGaugeTokenBalance] =
      await getAssetBalances({
        account: vaultProxy,
        assets: [crv, ldo, liquidityGaugeToken],
      });

    // Assert entire vault balances of reward tokens were used
    expect(postClaimRewardsCrvBalance).toEqBigNumber(0);
    expect(postClaimRewardsLdoBalance).toEqBigNumber(0);

    // Assert no rewards tokens are remaining in the adapter
    expect(await crv.balanceOf(curveLiquidityStethAdapter)).toEqBigNumber(0);
    expect(await ldo.balanceOf(curveLiquidityStethAdapter)).toEqBigNumber(0);

    // Assert the amount of liquidity gauge tokens in the vault increased
    expect(postClaimRewardsLiquidityGaugeTokenBalance).toBeGtBigNumber(preClaimRewardsLiquidityGaugeTokenBalance);
  });
});

describe('claimRewardsAndSwap', () => {
  it('claimed amounts only: claim rewards and swaps only the amounts claimed of each reward token (into WETH)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
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
    await curveStethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);

    // Send some balances of the rewards assets to the vault
    await crv.transfer(vaultProxy, utils.parseEther('2'));
    await ldo.transfer(vaultProxy, utils.parseEther('3'));

    const [preClaimRewardsCrvBalance, preClaimRewardsLdoBalance, preClaimRewardsIncomingAssetBalance] =
      await getAssetBalances({
        account: vaultProxy,
        assets: [crv, ldo, incomingAsset],
      });

    // Assert rewards tokens start with non-0 balances
    expect(preClaimRewardsCrvBalance).toBeGtBigNumber(0);
    expect(preClaimRewardsLdoBalance).toBeGtBigNumber(0);

    // Approve the adapter to claim $CRV rewards on behalf of the vault
    await vaultCallCurveMinterToggleApproveMint({
      comptrollerProxy,
      minter: fork.config.curve.minter,
      account: curveLiquidityStethAdapter,
    });

    // Approve the adapter to use CRV and LDO
    await curveApproveAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      adapter: curveLiquidityStethAdapter,
      assets: [fork.config.primitives.crv, ldo],
    });

    // Claim all earned rewards and swap for the specified incoming asset
    await curveStethClaimRewardsAndSwap({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      useFullBalances: false,
      incomingAsset: incomingAsset,
    });

    const [postClaimRewardsCrvBalance, postClaimRewardsLdoBalance, postClaimRewardsIncomingAssetBalance] =
      await getAssetBalances({
        account: vaultProxy,
        assets: [crv, ldo, incomingAsset],
      });

    // Assert only the newly claimed balances of reward tokens were used
    expect(postClaimRewardsCrvBalance).toEqBigNumber(preClaimRewardsCrvBalance);
    expect(postClaimRewardsLdoBalance).toEqBigNumber(preClaimRewardsLdoBalance);

    // Assert no rewards tokens are remaining in the adapter
    expect(await crv.balanceOf(curveLiquidityStethAdapter)).toEqBigNumber(0);
    expect(await ldo.balanceOf(curveLiquidityStethAdapter)).toEqBigNumber(0);

    // Assert the amount of incoming asset in the vault increased
    expect(postClaimRewardsIncomingAssetBalance).toBeGtBigNumber(preClaimRewardsIncomingAssetBalance);
  });

  it('full balances: claim rewards and swaps the full vault balances of each reward token (into DAI)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
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
    await curveStethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);

    // Send some balances of the rewards assets to the vault
    await crv.transfer(vaultProxy, utils.parseEther('2'));
    await ldo.transfer(vaultProxy, utils.parseEther('3'));

    const [preClaimRewardsCrvBalance, preClaimRewardsLdoBalance, preClaimRewardsIncomingAssetBalance] =
      await getAssetBalances({
        account: vaultProxy,
        assets: [crv, ldo, incomingAsset],
      });

    // Assert rewards tokens start with non-0 balances
    expect(preClaimRewardsCrvBalance).toBeGtBigNumber(0);
    expect(preClaimRewardsLdoBalance).toBeGtBigNumber(0);

    // Approve the adapter to claim $CRV rewards on behalf of the vault
    await vaultCallCurveMinterToggleApproveMint({
      comptrollerProxy,
      minter: fork.config.curve.minter,
      account: curveLiquidityStethAdapter,
    });

    // Approve the adapter to use CRV and LDO
    await curveApproveAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      adapter: curveLiquidityStethAdapter,
      assets: [fork.config.primitives.crv, ldo],
    });

    // Claim all earned rewards and swap for the specified incoming asset
    await curveStethClaimRewardsAndSwap({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      useFullBalances: true,
      incomingAsset,
    });

    const [postClaimRewardsCrvBalance, postClaimRewardsLdoBalance, postClaimRewardsIncomingAssetBalance] =
      await getAssetBalances({
        account: vaultProxy,
        assets: [crv, ldo, incomingAsset],
      });

    // Assert entire vault balances of reward tokens were used
    expect(postClaimRewardsCrvBalance).toEqBigNumber(0);
    expect(postClaimRewardsLdoBalance).toEqBigNumber(0);

    // Assert no rewards tokens are remaining in the adapter
    expect(await crv.balanceOf(curveLiquidityStethAdapter)).toEqBigNumber(0);
    expect(await ldo.balanceOf(curveLiquidityStethAdapter)).toEqBigNumber(0);

    // Assert the amount of incoming asset in the vault increased
    expect(postClaimRewardsIncomingAssetBalance).toBeGtBigNumber(preClaimRewardsIncomingAssetBalance);
  });
});

describe('claim rewards (manually)', () => {
  it('should accrue CRV to the VaultProxy after lending and staking, and should be able to claim CRV and LDO via available methods', async () => {
    const [fundOwner, approvedMintForCaller, randomUser] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
    const crv = new StandardToken(fork.config.primitives.crv, provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const gauge = new CurveLiquidityGaugeV2(fork.config.curve.pools.steth.liquidityGaugeToken, provider);
    const minter = new CurveMinter(fork.config.curve.minter, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Lend and stake to start accruing rewards
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount);
    await curveStethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);

    // Claim accrued CRV from the Minter directly via mint() and assert CRV balance increase
    await vaultCallCurveMinterMint({
      comptrollerProxy,
      minter,
      gauge,
    });
    const postMintTxCrvBalance = await crv.balanceOf(vaultProxy);
    expect(postMintTxCrvBalance).toBeGtBigNumber(0);

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);

    // Claim accrued CRV from the Minter directly via mint_many()
    await vaultCallCurveMinterMintMany({
      comptrollerProxy,
      minter,
      gauges: [gauge],
    });
    const postMintManyTxCrvBalance = await crv.balanceOf(vaultProxy);
    expect(postMintManyTxCrvBalance).toBeGtBigNumber(postMintTxCrvBalance);

    // Claim accrued CRV from the Minter by a third party via mint_for()
    await vaultCallCurveMinterToggleApproveMint({
      comptrollerProxy,
      minter,
      account: approvedMintForCaller,
    });

    await minter.connect(approvedMintForCaller).mint_for(gauge, vaultProxy);
    expect(await crv.balanceOf(vaultProxy)).toBeGtBigNumber(postMintManyTxCrvBalance);

    // Claim accrued LDO rewards by a random user
    await gauge.connect(randomUser).claim_rewards(vaultProxy);
    expect(await ldo.balanceOf(vaultProxy)).toBeGtBigNumber(0);
  });
});
