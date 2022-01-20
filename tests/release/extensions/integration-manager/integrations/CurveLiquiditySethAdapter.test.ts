import { randomAddress } from '@enzymefinance/ethers';
import {
  ChainlinkRateAsset,
  claimRewardsSelector,
  curveSethLendAndStakeArgs,
  curveSethLendArgs,
  curveSethRedeemArgs,
  curveSethStakeArgs,
  curveSethUnstakeAndRedeemArgs,
  curveSethUnstakeArgs,
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
  createNewFund,
  curveSethClaimRewards,
  curveSethLend,
  curveSethLendAndStake,
  curveSethRedeem,
  curveSethStake,
  curveSethUnstake,
  curveSethUnstakeAndRedeem,
  deployProtocolFixture,
  getAssetBalances,
  vaultCallCurveMinterToggleApproveMint,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

let fork: ProtocolDeployment;
let seth: StandardToken;
beforeEach(async () => {
  fork = await deployProtocolFixture();

  // Add seth to the asset universe for testing purposes
  seth = new StandardToken(fork.config.unsupportedAssets.seth, whales.seth);
  await fork.deployment.valueInterpreter.addPrimitives(
    [seth],
    [fork.config.chainlink.ethusd],
    [ChainlinkRateAsset.USD],
  );
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;

    expect(await curveLiquiditySethAdapter.getLpToken()).toMatchAddress(fork.config.curve.pools.seth.lpToken);
    expect(await curveLiquiditySethAdapter.getLiquidityGaugeToken()).toMatchAddress(
      fork.config.curve.pools.seth.liquidityGaugeToken,
    );
    expect(await curveLiquiditySethAdapter.getSethToken()).toMatchAddress(seth);

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
  });
});

describe('parseAssetsForAction', () => {
  it('does not allow a bad selector', async () => {
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;

    await expect(
      curveLiquiditySethAdapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), constants.HashZero),
    ).rejects.toBeRevertedWith('_selector invalid');
  });

  describe('claimRewards', () => {
    it('generates expected output', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;

      const result = await curveLiquiditySethAdapter.parseAssetsForAction(
        randomAddress(),
        claimRewardsSelector,
        constants.HashZero,
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForAction, {
        incomingAssets_: [],
        minIncomingAssetAmounts_: [],
        spendAssetAmounts_: [],
        spendAssetsHandleType_: SpendAssetsHandleType.None,
        spendAssets_: [],
      });
    });
  });

  describe('lend', () => {
    it('generates expected output (weth only)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const outgoingWethAmount = utils.parseEther('2');
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForAction(
        randomAddress(),
        lendSelector,
        curveSethLendArgs({
          minIncomingLPTokenAmount,
          outgoingSethAmount: BigNumber.from(0),
          outgoingWethAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.seth.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
        spendAssetAmounts_: [outgoingWethAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth],
      });
    });

    it('generates expected output (seth only)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const outgoingSethAmount = utils.parseEther('2');
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForAction(
        randomAddress(),
        lendSelector,
        curveSethLendArgs({
          minIncomingLPTokenAmount,
          outgoingSethAmount,
          outgoingWethAmount: BigNumber.from(0),
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.seth.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
        spendAssetAmounts_: [outgoingSethAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [seth],
      });
    });

    it('generates expected output (both assets)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const outgoingWethAmount = utils.parseEther('3');
      const outgoingSethAmount = utils.parseEther('2');
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForAction(
        randomAddress(),
        lendSelector,
        curveSethLendArgs({
          minIncomingLPTokenAmount,
          outgoingSethAmount,
          outgoingWethAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.seth.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
        spendAssetAmounts_: [outgoingWethAmount, outgoingSethAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth, seth],
      });
    });
  });

  describe('lendAndStake', () => {
    it('generates expected output (weth only)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const outgoingWethAmount = utils.parseEther('2');
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForAction(
        randomAddress(),
        lendAndStakeSelector,
        curveSethLendAndStakeArgs({
          minIncomingLiquidityGaugeTokenAmount,
          outgoingSethAmount: BigNumber.from(0),
          outgoingWethAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.seth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
        spendAssetAmounts_: [outgoingWethAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth],
      });
    });

    it('generates expected output (seth only)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const outgoingSethAmount = utils.parseEther('2');
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForAction(
        randomAddress(),
        lendAndStakeSelector,
        curveSethLendAndStakeArgs({
          minIncomingLiquidityGaugeTokenAmount,
          outgoingSethAmount,
          outgoingWethAmount: BigNumber.from(0),
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.seth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
        spendAssetAmounts_: [outgoingSethAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [seth],
      });
    });

    it('generates expected output (both assets)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const outgoingWethAmount = utils.parseEther('3');
      const outgoingSethAmount = utils.parseEther('2');
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForAction(
        randomAddress(),
        lendAndStakeSelector,
        curveSethLendAndStakeArgs({
          minIncomingLiquidityGaugeTokenAmount,
          outgoingSethAmount,
          outgoingWethAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.seth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
        spendAssetAmounts_: [outgoingWethAmount, outgoingSethAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth, seth],
      });
    });
  });

  describe('redeem', () => {
    it('generates expected output (standard)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const minIncomingSethAmount = utils.parseEther('2');
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForAction(
        randomAddress(),
        redeemSelector,
        curveSethRedeemArgs({
          minIncomingSethAmount,
          minIncomingWethAmount,
          outgoingLPTokenAmount,
          receiveSingleAsset: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.weth, seth],
        minIncomingAssetAmounts_: [minIncomingWethAmount, minIncomingSethAmount],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.seth.lpToken],
      });
    });

    it('generates expected output (single-asset: weth)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForAction(
        randomAddress(),
        redeemSelector,
        curveSethRedeemArgs({
          minIncomingSethAmount: BigNumber.from(0),
          minIncomingWethAmount,
          outgoingLPTokenAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.weth],
        minIncomingAssetAmounts_: [minIncomingWethAmount],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.seth.lpToken],
      });
    });

    it('generates expected output (single-asset: seth)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const minIncomingSethAmount = utils.parseEther('3');
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForAction(
        randomAddress(),
        redeemSelector,
        curveSethRedeemArgs({
          minIncomingSethAmount,
          minIncomingWethAmount: BigNumber.from(0),
          outgoingLPTokenAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForAction, {
        incomingAssets_: [seth],
        minIncomingAssetAmounts_: [minIncomingSethAmount],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.seth.lpToken],
      });
    });
  });

  describe('stake', () => {
    it('generates expected output', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const outgoingLPTokenAmount = utils.parseEther('2');

      const result = await curveLiquiditySethAdapter.parseAssetsForAction(
        randomAddress(),
        stakeSelector,
        curveSethStakeArgs({
          outgoingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.seth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [outgoingLPTokenAmount],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.seth.lpToken],
      });
    });
  });

  describe('unstake', () => {
    it('generates expected output', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('2');

      const result = await curveLiquiditySethAdapter.parseAssetsForAction(
        randomAddress(),
        unstakeSelector,
        curveSethUnstakeArgs({
          outgoingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.seth.lpToken],
        minIncomingAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.seth.liquidityGaugeToken],
      });
    });
  });

  describe('unstakeAndRedeem', () => {
    it('generates expected output (standard)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const minIncomingSethAmount = utils.parseEther('2');
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForAction(
        randomAddress(),
        unstakeAndRedeemSelector,
        curveSethUnstakeAndRedeemArgs({
          minIncomingSethAmount,
          minIncomingWethAmount,
          outgoingLiquidityGaugeTokenAmount,
          receiveSingleAsset: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.weth, seth],
        minIncomingAssetAmounts_: [minIncomingWethAmount, minIncomingSethAmount],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.seth.liquidityGaugeToken],
      });
    });

    it('generates expected output (single-asset: weth)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForAction(
        randomAddress(),
        unstakeAndRedeemSelector,
        curveSethUnstakeAndRedeemArgs({
          minIncomingSethAmount: BigNumber.from(0),
          minIncomingWethAmount,
          outgoingLiquidityGaugeTokenAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.weth],
        minIncomingAssetAmounts_: [minIncomingWethAmount],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.seth.liquidityGaugeToken],
      });
    });

    it('generates expected output (single-asset: seth)', async () => {
      const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
      const minIncomingSethAmount = utils.parseEther('3');
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquiditySethAdapter.parseAssetsForAction(
        randomAddress(),
        unstakeAndRedeemSelector,
        curveSethUnstakeAndRedeemArgs({
          minIncomingSethAmount,
          minIncomingWethAmount: BigNumber.from(0),
          outgoingLiquidityGaugeTokenAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquiditySethAdapter.parseAssetsForAction, {
        incomingAssets_: [seth],
        minIncomingAssetAmounts_: [minIncomingSethAmount],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.seth.liquidityGaugeToken],
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
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of weth
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));

    const preTxWethBalance = await weth.balanceOf(vaultProxy);

    await curveSethLend({
      comptrollerProxy,
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingSethAmount: BigNumber.from(0),
      outgoingWethAmount,
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
    const lpToken = new StandardToken(fork.config.curve.pools.seth.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const outgoingSethAmount = utils.parseEther('2');

    const preTxSethBalance = outgoingSethAmount.mul(2);

    // Seed fund with a surplus of seth
    await seth.transfer(vaultProxy, preTxSethBalance);

    await curveSethLend({
      comptrollerProxy,
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingSethAmount,
      outgoingWethAmount: BigNumber.from(0),
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
    const lpToken = new StandardToken(fork.config.curve.pools.seth.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
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
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingSethAmount,
      outgoingWethAmount,
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
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of weth
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));

    const preTxWethBalance = await weth.balanceOf(vaultProxy);

    await curveSethLendAndStake({
      comptrollerProxy,
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingSethAmount: BigNumber.from(0),
      outgoingWethAmount,
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
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.seth.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
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
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingSethAmount,
      outgoingWethAmount: BigNumber.from(0),
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
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.seth.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
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
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingSethAmount,
      outgoingWethAmount,
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
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lpToken = new StandardToken(fork.config.curve.pools.seth.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveSethLend({
      comptrollerProxy,
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingSethAmount: BigNumber.from(0),
      outgoingWethAmount,
    });

    const [preTxWethBalance, preTxSethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, seth, lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    await curveSethRedeem({
      comptrollerProxy,
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingSethAmount: BigNumber.from(1),
      minIncomingWethAmount: BigNumber.from(1),
      outgoingLPTokenAmount,
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
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lpToken = new StandardToken(fork.config.curve.pools.seth.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveSethLend({
      comptrollerProxy,
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingSethAmount: BigNumber.from(0),
      outgoingWethAmount,
    });

    const [preTxWethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    await curveSethRedeem({
      comptrollerProxy,
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingSethAmount: BigNumber.from(0),
      minIncomingWethAmount: BigNumber.from(1),
      outgoingLPTokenAmount,
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
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lpToken = new StandardToken(fork.config.curve.pools.seth.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveSethLend({
      comptrollerProxy,
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingSethAmount: BigNumber.from(0),
      outgoingWethAmount,
    });

    const [preTxWethBalance, preTxSethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, seth, lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    await curveSethRedeem({
      comptrollerProxy,
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingSethAmount: BigNumber.from(1),
      minIncomingWethAmount: BigNumber.from(0),
      outgoingLPTokenAmount,
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
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.seth.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of weth and lend and stake for liquidity gauge tokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveSethLendAndStake({
      comptrollerProxy,
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingSethAmount: BigNumber.from(0),
      outgoingWethAmount,
    });

    const [preTxWethBalance, preTxSethBalance, preTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, seth, liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLiquidityGaugeTokenBalance.div(2);

    await curveSethUnstakeAndRedeem({
      comptrollerProxy,
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingSethAmount: BigNumber.from(1),
      minIncomingWethAmount: BigNumber.from(1),
      outgoingLiquidityGaugeTokenAmount,
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
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.seth.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveSethLendAndStake({
      comptrollerProxy,
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingSethAmount: BigNumber.from(0),
      outgoingWethAmount,
    });

    const [preTxWethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLpTokenBalance.div(2);

    await curveSethUnstakeAndRedeem({
      comptrollerProxy,
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingSethAmount: BigNumber.from(0),
      minIncomingWethAmount: BigNumber.from(1),
      outgoingLiquidityGaugeTokenAmount,
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
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.seth.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveSethLendAndStake({
      comptrollerProxy,
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingSethAmount: BigNumber.from(0),
      outgoingWethAmount,
    });

    const [preTxWethBalance, preTxSethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, seth, liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLpTokenBalance.div(2);

    await curveSethUnstakeAndRedeem({
      comptrollerProxy,
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingSethAmount: BigNumber.from(1),
      minIncomingWethAmount: BigNumber.from(0),
      outgoingLiquidityGaugeTokenAmount,
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
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // First, acquire some lpTokens by lending on Curve
    // Seed fund with a surplus of weth
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveSethLend({
      comptrollerProxy,
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingSethAmount: BigNumber.from(0),
      outgoingWethAmount,
    });

    // Stake the LP tokens
    const preStakeTxLpTokenBalance = await lpToken.balanceOf(vaultProxy);
    const stakeLPTokenAmount = preStakeTxLpTokenBalance.div(2);

    await curveSethStake({
      comptrollerProxy,
      curveLiquiditySethAdapter,
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
    await curveSethUnstake({
      comptrollerProxy,
      curveLiquiditySethAdapter,
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

describe('claimRewards', () => {
  it('claims CRV and pool token rewards, which land in the vault', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquiditySethAdapter = fork.deployment.curveLiquiditySethAdapter;
    const crv = new StandardToken(fork.config.primitives.crv, provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Lend and stake to start accruing rewards
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount);
    await curveSethLendAndStake({
      comptrollerProxy,
      curveLiquiditySethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingSethAmount: BigNumber.from(0),
      outgoingWethAmount,
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
      account: curveLiquiditySethAdapter,
      comptrollerProxy,
      minter: fork.config.curve.minter,
    });

    // Claim all earned rewards
    await curveSethClaimRewards({
      comptrollerProxy,
      curveLiquiditySethAdapter,
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
