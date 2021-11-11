import { randomAddress } from '@enzymefinance/ethers';
import {
  claimRewardsSelector,
  curveStethLendAndStakeArgs,
  curveStethLendArgs,
  curveStethRedeemArgs,
  curveStethStakeArgs,
  curveStethUnstakeAndRedeemArgs,
  curveStethUnstakeArgs,
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
  CurveLiquidityGaugeV2,
  CurveMinter,
  curveStethClaimRewards,
  curveStethLend,
  curveStethLendAndStake,
  curveStethRedeem,
  curveStethStake,
  curveStethUnstake,
  curveStethUnstakeAndRedeem,
  deployProtocolFixture,
  getAssetBalances,
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
  });
});

describe('parseAssetsForAction', () => {
  it('does not allow a bad selector', async () => {
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;

    await expect(
      curveLiquidityStethAdapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), constants.HashZero),
    ).rejects.toBeRevertedWith('_selector invalid');
  });

  describe('claimRewards', () => {
    it('generates expected output', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;

      const result = await curveLiquidityStethAdapter.parseAssetsForAction(
        randomAddress(),
        claimRewardsSelector,
        constants.HashZero,
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForAction, {
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
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const outgoingWethAmount = utils.parseEther('2');
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForAction(
        randomAddress(),
        lendSelector,
        curveStethLendArgs({
          minIncomingLPTokenAmount,
          outgoingStethAmount: BigNumber.from(0),
          outgoingWethAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.steth.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
        spendAssetAmounts_: [outgoingWethAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth],
      });
    });

    it('generates expected output (steth only)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const outgoingStethAmount = utils.parseEther('2');
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForAction(
        randomAddress(),
        lendSelector,
        curveStethLendArgs({
          minIncomingLPTokenAmount,
          outgoingStethAmount,
          outgoingWethAmount: BigNumber.from(0),
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.steth.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
        spendAssetAmounts_: [outgoingStethAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.lido.steth],
      });
    });

    it('generates expected output (both assets)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const outgoingWethAmount = utils.parseEther('3');
      const outgoingStethAmount = utils.parseEther('2');
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForAction(
        randomAddress(),
        lendSelector,
        curveStethLendArgs({
          minIncomingLPTokenAmount,
          outgoingStethAmount,
          outgoingWethAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.steth.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
        spendAssetAmounts_: [outgoingWethAmount, outgoingStethAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth, fork.config.lido.steth],
      });
    });
  });

  describe('lendAndStake', () => {
    it('generates expected output (weth only)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const outgoingWethAmount = utils.parseEther('2');
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForAction(
        randomAddress(),
        lendAndStakeSelector,
        curveStethLendAndStakeArgs({
          minIncomingLiquidityGaugeTokenAmount,
          outgoingStethAmount: BigNumber.from(0),
          outgoingWethAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
        spendAssetAmounts_: [outgoingWethAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth],
      });
    });

    it('generates expected output (steth only)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const outgoingStethAmount = utils.parseEther('2');
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForAction(
        randomAddress(),
        lendAndStakeSelector,
        curveStethLendAndStakeArgs({
          minIncomingLiquidityGaugeTokenAmount,
          outgoingStethAmount,
          outgoingWethAmount: BigNumber.from(0),
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
        spendAssetAmounts_: [outgoingStethAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.lido.steth],
      });
    });

    it('generates expected output (both assets)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const outgoingWethAmount = utils.parseEther('3');
      const outgoingStethAmount = utils.parseEther('2');
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForAction(
        randomAddress(),
        lendAndStakeSelector,
        curveStethLendAndStakeArgs({
          minIncomingLiquidityGaugeTokenAmount,
          outgoingStethAmount,
          outgoingWethAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
        spendAssetAmounts_: [outgoingWethAmount, outgoingStethAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth, fork.config.lido.steth],
      });
    });
  });

  describe('redeem', () => {
    it('generates expected output (standard)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const minIncomingStethAmount = utils.parseEther('2');
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForAction(
        randomAddress(),
        redeemSelector,
        curveStethRedeemArgs({
          minIncomingStethAmount,
          minIncomingWethAmount,
          outgoingLPTokenAmount,
          receiveSingleAsset: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.weth, fork.config.lido.steth],
        minIncomingAssetAmounts_: [minIncomingWethAmount, minIncomingStethAmount],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.lpToken],
      });
    });

    it('generates expected output (single-asset: weth)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForAction(
        randomAddress(),
        redeemSelector,
        curveStethRedeemArgs({
          minIncomingStethAmount: BigNumber.from(0),
          minIncomingWethAmount,
          outgoingLPTokenAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.weth],
        minIncomingAssetAmounts_: [minIncomingWethAmount],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.lpToken],
      });
    });

    it('generates expected output (single-asset: steth)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const minIncomingStethAmount = utils.parseEther('3');
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForAction(
        randomAddress(),
        redeemSelector,
        curveStethRedeemArgs({
          minIncomingStethAmount,
          minIncomingWethAmount: BigNumber.from(0),
          outgoingLPTokenAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.lido.steth],
        minIncomingAssetAmounts_: [minIncomingStethAmount],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.lpToken],
      });
    });
  });

  describe('stake', () => {
    it('generates expected output', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const outgoingLPTokenAmount = utils.parseEther('2');

      const result = await curveLiquidityStethAdapter.parseAssetsForAction(
        randomAddress(),
        stakeSelector,
        curveStethStakeArgs({
          outgoingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [outgoingLPTokenAmount],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.lpToken],
      });
    });
  });

  describe('unstake', () => {
    it('generates expected output', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('2');

      const result = await curveLiquidityStethAdapter.parseAssetsForAction(
        randomAddress(),
        unstakeSelector,
        curveStethUnstakeArgs({
          outgoingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.steth.lpToken],
        minIncomingAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
      });
    });
  });

  describe('unstakeAndRedeem', () => {
    it('generates expected output (standard)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const minIncomingStethAmount = utils.parseEther('2');
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForAction(
        randomAddress(),
        unstakeAndRedeemSelector,
        curveStethUnstakeAndRedeemArgs({
          minIncomingStethAmount,
          minIncomingWethAmount,
          outgoingLiquidityGaugeTokenAmount,
          receiveSingleAsset: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.weth, fork.config.lido.steth],
        minIncomingAssetAmounts_: [minIncomingWethAmount, minIncomingStethAmount],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
      });
    });

    it('generates expected output (single-asset: weth)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForAction(
        randomAddress(),
        unstakeAndRedeemSelector,
        curveStethUnstakeAndRedeemArgs({
          minIncomingStethAmount: BigNumber.from(0),
          minIncomingWethAmount,
          outgoingLiquidityGaugeTokenAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.weth],
        minIncomingAssetAmounts_: [minIncomingWethAmount],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
      });
    });

    it('generates expected output (single-asset: steth)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
      const minIncomingStethAmount = utils.parseEther('3');
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForAction(
        randomAddress(),
        unstakeAndRedeemSelector,
        curveStethUnstakeAndRedeemArgs({
          minIncomingStethAmount,
          minIncomingWethAmount: BigNumber.from(0),
          outgoingLiquidityGaugeTokenAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.lido.steth],
        minIncomingAssetAmounts_: [minIncomingStethAmount],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
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
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of weth
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));

    const preTxWethBalance = await weth.balanceOf(vaultProxy);

    await curveStethLend({
      comptrollerProxy,
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingStethAmount: BigNumber.from(0),
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

  it('works as expected (with only steth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, whales.lidoSteth);
    const lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const outgoingStethAmount = utils.parseEther('2');

    // TODO: the test runner has some weird behavior where the stETH balance here
    // is reporting 1 wei less than it should be, if queried directly
    const preTxStethBalance = outgoingStethAmount.mul(2);

    // Seed fund with a surplus of steth
    await steth.transfer(vaultProxy, preTxStethBalance);

    await curveStethLend({
      comptrollerProxy,
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingStethAmount,
      outgoingWethAmount: BigNumber.from(0),
    });

    const [postTxStethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [steth, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxStethBalance).toBeAroundBigNumber(preTxStethBalance.sub(outgoingStethAmount), 1);
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
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
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
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingStethAmount,
      outgoingWethAmount,
    });

    const [postTxWethBalance, postTxStethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxWethBalance).toBeAroundBigNumber(preTxWethBalance.sub(outgoingWethAmount), 1);
    expect(postTxStethBalance).toBeAroundBigNumber(preTxStethBalance.sub(outgoingStethAmount), 1);
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
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of weth
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));

    const preTxWethBalance = await weth.balanceOf(vaultProxy);

    await curveStethLendAndStake({
      comptrollerProxy,
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingStethAmount: BigNumber.from(0),
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

  it('works as expected (with only steth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, whales.lidoSteth);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.steth.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
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
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingStethAmount,
      outgoingWethAmount: BigNumber.from(0),
    });

    const [postTxStethBalance, postTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [steth, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxStethBalance).toBeAroundBigNumber(preTxStethBalance.sub(outgoingStethAmount), 1);
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
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
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
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingStethAmount,
      outgoingWethAmount,
    });

    const [postTxWethBalance, postTxStethBalance, postTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxWethBalance).toBeAroundBigNumber(preTxWethBalance.sub(outgoingWethAmount), 1);
    expect(postTxStethBalance).toBeAroundBigNumber(preTxStethBalance.sub(outgoingStethAmount), 1);
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
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLend({
      comptrollerProxy,
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingStethAmount: BigNumber.from(0),
      outgoingWethAmount,
    });

    const [preTxWethBalance, preTxStethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    await curveStethRedeem({
      comptrollerProxy,
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingStethAmount: BigNumber.from(1),
      minIncomingWethAmount: BigNumber.from(1),
      outgoingLPTokenAmount,
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
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLend({
      comptrollerProxy,
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingStethAmount: BigNumber.from(0),
      outgoingWethAmount,
    });

    const [preTxWethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    await curveStethRedeem({
      comptrollerProxy,
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingStethAmount: BigNumber.from(0),
      minIncomingWethAmount: BigNumber.from(1),
      outgoingLPTokenAmount,
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
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLend({
      comptrollerProxy,
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingStethAmount: BigNumber.from(0),
      outgoingWethAmount,
    });

    const [preTxWethBalance, preTxStethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    await curveStethRedeem({
      comptrollerProxy,
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingStethAmount: BigNumber.from(1),
      minIncomingWethAmount: BigNumber.from(0),
      outgoingLPTokenAmount,
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
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of weth and lend and stake for liquidity gauge tokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLendAndStake({
      comptrollerProxy,
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingStethAmount: BigNumber.from(0),
      outgoingWethAmount,
    });

    const [preTxWethBalance, preTxStethBalance, preTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLiquidityGaugeTokenBalance.div(2);

    await curveStethUnstakeAndRedeem({
      comptrollerProxy,
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingStethAmount: BigNumber.from(1),
      minIncomingWethAmount: BigNumber.from(1),
      outgoingLiquidityGaugeTokenAmount,
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
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLendAndStake({
      comptrollerProxy,
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingStethAmount: BigNumber.from(0),
      outgoingWethAmount,
    });

    const [preTxWethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLpTokenBalance.div(2);

    await curveStethUnstakeAndRedeem({
      comptrollerProxy,
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingStethAmount: BigNumber.from(0),
      minIncomingWethAmount: BigNumber.from(1),
      outgoingLiquidityGaugeTokenAmount,
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
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLendAndStake({
      comptrollerProxy,
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingStethAmount: BigNumber.from(0),
      outgoingWethAmount,
    });

    const [preTxWethBalance, preTxStethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLpTokenBalance.div(2);

    await curveStethUnstakeAndRedeem({
      comptrollerProxy,
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingStethAmount: BigNumber.from(1),
      minIncomingWethAmount: BigNumber.from(0),
      outgoingLiquidityGaugeTokenAmount,
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
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // First, acquire some lpTokens by lending on Curve
    // Seed fund with a surplus of weth
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLend({
      comptrollerProxy,
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingStethAmount: BigNumber.from(0),
      outgoingWethAmount,
    });

    // Stake the LP tokens
    const preStakeTxLpTokenBalance = await lpToken.balanceOf(vaultProxy);
    const stakeLPTokenAmount = preStakeTxLpTokenBalance.div(2);

    await curveStethStake({
      comptrollerProxy,
      curveLiquidityStethAdapter,
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
    await curveStethUnstake({
      comptrollerProxy,
      curveLiquidityStethAdapter,
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
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
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
    await curveStethLendAndStake({
      comptrollerProxy,
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingStethAmount: BigNumber.from(0),
      outgoingWethAmount,
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
      account: curveLiquidityStethAdapter,
      comptrollerProxy,
      minter: fork.config.curve.minter,
    });

    // Claim all earned rewards
    await curveStethClaimRewards({
      comptrollerProxy,
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
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

describe('claim rewards (manually)', () => {
  it('should accrue CRV to the VaultProxy after lending and staking, and should be able to claim CRV and LDO via available methods', async () => {
    const [fundOwner, approvedMintForCaller, randomUser] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.curveLiquidityStethAdapter;
    const crv = new StandardToken(fork.config.primitives.crv, provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const gauge = new CurveLiquidityGaugeV2(fork.config.curve.pools.steth.liquidityGaugeToken, provider);
    const minter = new CurveMinter(fork.config.curve.minter, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Lend and stake to start accruing rewards
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount);
    await curveStethLendAndStake({
      comptrollerProxy,
      curveLiquidityStethAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingStethAmount: BigNumber.from(0),
      outgoingWethAmount,
    });

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);

    // Claim accrued CRV from the Minter directly via mint() and assert CRV balance increase
    await vaultCallCurveMinterMint({
      comptrollerProxy,
      gauge,
      minter,
    });
    const postMintTxCrvBalance = await crv.balanceOf(vaultProxy);
    expect(postMintTxCrvBalance).toBeGtBigNumber(0);

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);

    // Claim accrued CRV from the Minter directly via mint_many()
    await vaultCallCurveMinterMintMany({
      comptrollerProxy,
      gauges: [gauge],
      minter,
    });
    const postMintManyTxCrvBalance = await crv.balanceOf(vaultProxy);
    expect(postMintManyTxCrvBalance).toBeGtBigNumber(postMintTxCrvBalance);

    // Claim accrued CRV from the Minter by a third party via mint_for()
    await vaultCallCurveMinterToggleApproveMint({
      account: approvedMintForCaller,
      comptrollerProxy,
      minter,
    });

    await minter.connect(approvedMintForCaller).mint_for(gauge, vaultProxy);
    expect(await crv.balanceOf(vaultProxy)).toBeGtBigNumber(postMintManyTxCrvBalance);

    // Claim accrued LDO rewards by a random user
    await gauge.connect(randomUser).claim_rewards(vaultProxy);
    expect(await ldo.balanceOf(vaultProxy)).toBeGtBigNumber(0);
  });
});
