import { randomAddress } from '@enzymefinance/ethers';
import {
  approveAssetsSelector,
  claimRewardsAndReinvestSelector,
  claimRewardsAndSwapSelector,
  claimRewardsSelector,
  CurveAavePoolAssetIndex,
  curveApproveAssetsArgs,
  curveAaveClaimRewardsAndReinvestArgs,
  curveAaveClaimRewardsAndSwapArgs,
  curveAaveLendArgs,
  curveAaveLendAndStakeArgs,
  curveAaveRedeemArgs,
  curveAaveStakeArgs,
  curveAaveUnstakeArgs,
  curveAaveUnstakeAndRedeemArgs,
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
  aaveLend,
  createNewFund,
  curveApproveAssets,
  curveAaveClaimRewards,
  curveAaveClaimRewardsAndReinvest,
  curveAaveClaimRewardsAndSwap,
  curveAaveLend,
  curveAaveLendAndStake,
  curveAaveRedeem,
  curveAaveStake,
  curveAaveUnstake,
  curveAaveUnstakeAndRedeem,
  deployProtocolFixture,
  getAssetBalances,
  ProtocolDeployment,
  vaultCallCurveMinterToggleApproveMint,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

const stkAave = '0x4da27a545c0c5b758a6ba100e3a049001de870f5';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;

    expect(await curveLiquidityAaveAdapter.getLpToken()).toMatchAddress(fork.config.curve.pools.aave.lpToken);
    expect(await curveLiquidityAaveAdapter.getLiquidityGaugeToken()).toMatchAddress(
      fork.config.curve.pools.aave.liquidityGaugeToken,
    );
    expect(await curveLiquidityAaveAdapter.getWethToken()).toMatchAddress(fork.config.weth);

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

    // UniswapV2ActionsMixin
    expect(await curveLiquidityAaveAdapter.getUniswapV2Router2()).toMatchAddress(fork.config.uniswap.router);
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;

    await expect(
      curveLiquidityAaveAdapter.parseAssetsForMethod(utils.randomBytes(4), constants.HashZero),
    ).rejects.toBeRevertedWith('_selector invalid');
  });

  describe('approveAssets', () => {
    it('does not allow unequal input arrays', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;

      await expect(
        curveLiquidityAaveAdapter.parseAssetsForMethod(
          approveAssetsSelector,
          curveApproveAssetsArgs({
            assets: [randomAddress(), randomAddress()],
            amounts: [1],
          }),
        ),
      ).rejects.toBeRevertedWith('Unequal arrays');
    });

    it('does not allow an asset that is not a rewards token (with an amount >0)', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;

      await expect(
        curveLiquidityAaveAdapter.parseAssetsForMethod(
          approveAssetsSelector,
          curveApproveAssetsArgs({
            assets: [randomAddress()],
            amounts: [1],
          }),
        ),
      ).rejects.toBeRevertedWith('Invalid reward token');
    });

    it('generates expected output', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;

      // Random address should be allowed since amount is 0
      const assets = [fork.config.primitives.crv, randomAddress()];
      const amounts = [1, 0];
      const result = await curveLiquidityAaveAdapter.parseAssetsForMethod(
        approveAssetsSelector,
        curveApproveAssetsArgs({
          assets,
          amounts,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForMethod, {
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
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;

      const result = await curveLiquidityAaveAdapter.parseAssetsForMethod(claimRewardsSelector, constants.HashZero);

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForMethod, {
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
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('2');

      const result = await curveLiquidityAaveAdapter.parseAssetsForMethod(
        claimRewardsAndReinvestSelector,
        curveAaveClaimRewardsAndReinvestArgs({
          useFullBalances: true, // Does not matter
          minIncomingLiquidityGaugeTokenAmount,
          intermediaryUnderlyingAssetIndex: CurveAavePoolAssetIndex.AaveUsdc, // Does not matter
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.None,
        spendAssets_: [],
        spendAssetAmounts_: [],
        incomingAssets_: [fork.config.curve.pools.aave.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
      });
    });
  });

  describe('claimRewardsAndSwap', () => {
    it('generates expected output', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const incomingAsset = randomAddress();
      const minIncomingAssetAmount = utils.parseEther('2');

      const result = await curveLiquidityAaveAdapter.parseAssetsForMethod(
        claimRewardsAndSwapSelector,
        curveAaveClaimRewardsAndSwapArgs({
          useFullBalances: true, // Does not matter
          incomingAsset,
          minIncomingAssetAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.None,
        spendAssets_: [],
        spendAssetAmounts_: [],
        incomingAssets_: [incomingAsset],
        minIncomingAssetAmounts_: [minIncomingAssetAmount],
      });
    });
  });

  describe('lend', () => {
    it('generates expected output (one asset only, not underlying)', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const outgoingAaveDaiAmount = utils.parseEther('2');
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityAaveAdapter.parseAssetsForMethod(
        lendSelector,
        curveAaveLendArgs({
          outgoingAaveDaiAmount,
          outgoingAaveUsdcAmount: BigNumber.from(0),
          outgoingAaveUsdtAmount: BigNumber.from(0),
          minIncomingLPTokenAmount,
          useUnderlyings: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.aave.atokens.adai[0]], // aToken
        spendAssetAmounts_: [outgoingAaveDaiAmount],
        incomingAssets_: [fork.config.curve.pools.aave.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
      });
    });

    it('generates expected output (two assets, underlyings)', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const outgoingAaveDaiAmount = utils.parseEther('2');
      const outgoingAaveUsdtAmount = utils.parseEther('3');
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityAaveAdapter.parseAssetsForMethod(
        lendSelector,
        curveAaveLendArgs({
          outgoingAaveDaiAmount,
          outgoingAaveUsdcAmount: BigNumber.from(0),
          outgoingAaveUsdtAmount,
          minIncomingLPTokenAmount,
          useUnderlyings: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.primitives.dai, fork.config.primitives.usdt], // aToken underlyings
        spendAssetAmounts_: [outgoingAaveDaiAmount, outgoingAaveUsdtAmount],
        incomingAssets_: [fork.config.curve.pools.aave.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
      });
    });
  });

  describe('lendAndStake', () => {
    it('generates expected output (one asset only, not underlying)', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const outgoingAaveDaiAmount = utils.parseEther('2');
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityAaveAdapter.parseAssetsForMethod(
        lendAndStakeSelector,
        curveAaveLendAndStakeArgs({
          outgoingAaveDaiAmount,
          outgoingAaveUsdcAmount: BigNumber.from(0),
          outgoingAaveUsdtAmount: BigNumber.from(0),
          minIncomingLiquidityGaugeTokenAmount,
          useUnderlyings: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.aave.atokens.adai[0]], // aToken
        spendAssetAmounts_: [outgoingAaveDaiAmount],
        incomingAssets_: [fork.config.curve.pools.aave.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
      });
    });

    it('generates expected output (two assets, underlyings)', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const outgoingAaveDaiAmount = utils.parseEther('2');
      const outgoingAaveUsdtAmount = utils.parseEther('3');
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityAaveAdapter.parseAssetsForMethod(
        lendAndStakeSelector,
        curveAaveLendAndStakeArgs({
          outgoingAaveDaiAmount,
          outgoingAaveUsdcAmount: BigNumber.from(0),
          outgoingAaveUsdtAmount,
          minIncomingLiquidityGaugeTokenAmount,
          useUnderlyings: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.primitives.dai, fork.config.primitives.usdt], // aToken underlyings
        spendAssetAmounts_: [outgoingAaveDaiAmount, outgoingAaveUsdtAmount],
        incomingAssets_: [fork.config.curve.pools.aave.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
      });
    });
  });

  describe('redeem', () => {
    it('single asset redemption does not allow multiple incoming assets', async () => {
      await expect(
        fork.deployment.curveLiquidityAaveAdapter.parseAssetsForMethod(
          redeemSelector,
          curveAaveRedeemArgs({
            outgoingLPTokenAmount: BigNumber.from(1),
            minIncomingAaveDaiAmount: BigNumber.from(1),
            minIncomingAaveUsdcAmount: BigNumber.from(1),
            minIncomingAaveUsdtAmount: BigNumber.from(0),
            receiveSingleAsset: true,
            useUnderlyings: false,
          }),
        ),
      ).rejects.toBeRevertedWith('Too many min asset amounts specified');
    });

    it('single asset redemption does not allow no incoming assets', async () => {
      await expect(
        fork.deployment.curveLiquidityAaveAdapter.parseAssetsForMethod(
          redeemSelector,
          curveAaveRedeemArgs({
            outgoingLPTokenAmount: BigNumber.from(1),
            minIncomingAaveDaiAmount: BigNumber.from(0),
            minIncomingAaveUsdcAmount: BigNumber.from(0),
            minIncomingAaveUsdtAmount: BigNumber.from(0),
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

      const result = await curveLiquidityAaveAdapter.parseAssetsForMethod(
        redeemSelector,
        curveAaveRedeemArgs({
          outgoingLPTokenAmount,
          minIncomingAaveDaiAmount,
          minIncomingAaveUsdcAmount,
          minIncomingAaveUsdtAmount,
          receiveSingleAsset: false,
          useUnderlyings: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.aave.lpToken],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        incomingAssets_: [
          fork.config.aave.atokens.adai[0],
          fork.config.aave.atokens.ausdc[0],
          fork.config.aave.atokens.ausdt[0],
        ],
        minIncomingAssetAmounts_: [minIncomingAaveDaiAmount, minIncomingAaveUsdcAmount, minIncomingAaveUsdtAmount],
      });
    });

    it('generates expected output (single asset, underlyings)', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const minIncomingAaveUsdcAmount = utils.parseEther('2');
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityAaveAdapter.parseAssetsForMethod(
        redeemSelector,
        curveAaveRedeemArgs({
          outgoingLPTokenAmount,
          minIncomingAaveDaiAmount: BigNumber.from(0),
          minIncomingAaveUsdcAmount,
          minIncomingAaveUsdtAmount: BigNumber.from(0),
          receiveSingleAsset: true,
          useUnderlyings: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.aave.lpToken],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        incomingAssets_: [fork.config.primitives.usdc],
        minIncomingAssetAmounts_: [minIncomingAaveUsdcAmount],
      });
    });
  });

  describe('stake', () => {
    it('generates expected output', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const outgoingLPTokenAmount = utils.parseEther('2');

      const result = await curveLiquidityAaveAdapter.parseAssetsForMethod(
        stakeSelector,
        curveAaveStakeArgs({
          outgoingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.aave.lpToken],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        incomingAssets_: [fork.config.curve.pools.aave.liquidityGaugeToken],
        minIncomingAssetAmounts_: [outgoingLPTokenAmount],
      });
    });
  });

  describe('unstake', () => {
    it('generates expected output', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('2');

      const result = await curveLiquidityAaveAdapter.parseAssetsForMethod(
        unstakeSelector,
        curveAaveUnstakeArgs({
          outgoingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.aave.liquidityGaugeToken],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        incomingAssets_: [fork.config.curve.pools.aave.lpToken],
        minIncomingAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
      });
    });
  });

  describe('unstakeAndRedeem', () => {
    it('single asset redemption does not allow multiple incoming assets', async () => {
      await expect(
        fork.deployment.curveLiquidityAaveAdapter.parseAssetsForMethod(
          unstakeAndRedeemSelector,
          curveAaveUnstakeAndRedeemArgs({
            outgoingLiquidityGaugeTokenAmount: BigNumber.from(1),
            minIncomingAaveDaiAmount: BigNumber.from(1),
            minIncomingAaveUsdcAmount: BigNumber.from(1),
            minIncomingAaveUsdtAmount: BigNumber.from(0),
            receiveSingleAsset: true,
            useUnderlyings: false,
          }),
        ),
      ).rejects.toBeRevertedWith('Too many min asset amounts specified');
    });

    it('single asset redemption does not allow no incoming assets', async () => {
      await expect(
        fork.deployment.curveLiquidityAaveAdapter.parseAssetsForMethod(
          unstakeAndRedeemSelector,
          curveAaveUnstakeAndRedeemArgs({
            outgoingLiquidityGaugeTokenAmount: BigNumber.from(1),
            minIncomingAaveDaiAmount: BigNumber.from(0),
            minIncomingAaveUsdcAmount: BigNumber.from(0),
            minIncomingAaveUsdtAmount: BigNumber.from(0),
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

      const result = await curveLiquidityAaveAdapter.parseAssetsForMethod(
        unstakeAndRedeemSelector,
        curveAaveUnstakeAndRedeemArgs({
          outgoingLiquidityGaugeTokenAmount,
          minIncomingAaveDaiAmount,
          minIncomingAaveUsdcAmount,
          minIncomingAaveUsdtAmount,
          receiveSingleAsset: false,
          useUnderlyings: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.aave.liquidityGaugeToken],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        incomingAssets_: [
          fork.config.aave.atokens.adai[0],
          fork.config.aave.atokens.ausdc[0],
          fork.config.aave.atokens.ausdt[0],
        ],
        minIncomingAssetAmounts_: [minIncomingAaveDaiAmount, minIncomingAaveUsdcAmount, minIncomingAaveUsdtAmount],
      });
    });

    it('generates expected output (single asset, underlyings)', async () => {
      const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
      const minIncomingAaveUsdcAmount = utils.parseEther('2');
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityAaveAdapter.parseAssetsForMethod(
        unstakeAndRedeemSelector,
        curveAaveUnstakeAndRedeemArgs({
          outgoingLiquidityGaugeTokenAmount,
          minIncomingAaveDaiAmount: BigNumber.from(0),
          minIncomingAaveUsdcAmount,
          minIncomingAaveUsdtAmount: BigNumber.from(0),
          receiveSingleAsset: true,
          useUnderlyings: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAaveAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.aave.liquidityGaugeToken],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        incomingAssets_: [fork.config.primitives.usdc],
        minIncomingAssetAmounts_: [minIncomingAaveUsdcAmount],
      });
    });
  });
});

describe('claimRewards', () => {
  it('claims CRV, which lands in the vault', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const crv = new StandardToken(fork.config.primitives.crv, provider);
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    // Lend and stake to start accruing rewards
    const seedDaiAmount = utils.parseEther('2');
    await dai.transfer(vaultProxy, seedDaiAmount);
    await curveAaveLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
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
      comptrollerProxy,
      minter: fork.config.curve.minter,
      account: curveLiquidityAaveAdapter,
    });

    // Claim all earned rewards
    await curveAaveClaimRewards({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
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
  it('claimed amounts only (DAI intermediary): claim rewards and then reinvests only the amounts claimed of each reward token', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const integrationManager = fork.deployment.integrationManager;
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.aave.liquidityGaugeToken, provider);
    const crv = new StandardToken(fork.config.primitives.crv, whales.crv);
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, whales.weth),
    });

    // Lend and stake to start accruing rewards
    const seedDaiAmount = utils.parseEther('2');
    await dai.transfer(vaultProxy, seedDaiAmount);
    await curveAaveLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
      outgoingAaveDaiAmount: seedDaiAmount,
      useUnderlyings: true,
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
      account: curveLiquidityAaveAdapter,
    });

    // Approve the adapter to use CRV
    await curveApproveAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      adapter: curveLiquidityAaveAdapter,
      assets: [fork.config.primitives.crv, stkAave],
    });

    // Claim all earned rewards
    await curveAaveClaimRewardsAndReinvest({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
      useFullBalances: false,
      // intermediaryUnderlyingAssetIndex is DAI by default
    });

    const [postClaimRewardsCrvBalance, postClaimRewardsLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv, liquidityGaugeToken],
    });

    // Assert only the newly claimed balances of reward tokens were used
    expect(postClaimRewardsCrvBalance).toEqBigNumber(preClaimRewardsCrvBalance);

    // Assert no rewards tokens are remaining in the adapter
    expect(await crv.balanceOf(curveLiquidityAaveAdapter)).toEqBigNumber(0);

    // Assert the amount of liquidity gauge tokens in the vault increased
    expect(postClaimRewardsLiquidityGaugeTokenBalance).toBeGtBigNumber(preClaimRewardsLiquidityGaugeTokenBalance);
  });

  it('full balances (USDT intermediary): claim rewards and then reinvests the full vault balances of each reward token', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const integrationManager = fork.deployment.integrationManager;
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.aave.liquidityGaugeToken, provider);
    const crv = new StandardToken(fork.config.primitives.crv, whales.crv);
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, whales.weth),
    });

    // Lend and stake to start accruing rewards
    const seedDaiAmount = utils.parseEther('2');
    await dai.transfer(vaultProxy, seedDaiAmount);
    await curveAaveLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
      outgoingAaveDaiAmount: seedDaiAmount,
      useUnderlyings: true,
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
      account: curveLiquidityAaveAdapter,
    });

    // Approve the adapter to use CRV
    await curveApproveAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      adapter: curveLiquidityAaveAdapter,
      assets: [fork.config.primitives.crv, stkAave],
    });

    // Claim all earned rewards
    await curveAaveClaimRewardsAndReinvest({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
      useFullBalances: true,
      intermediaryUnderlyingAssetIndex: CurveAavePoolAssetIndex.AaveUsdt,
    });

    const [postClaimRewardsCrvBalance, postClaimRewardsLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv, liquidityGaugeToken],
    });

    // Assert entire vault balances of reward tokens were used
    expect(postClaimRewardsCrvBalance).toEqBigNumber(0);

    // Assert no rewards tokens are remaining in the adapter
    expect(await crv.balanceOf(curveLiquidityAaveAdapter)).toEqBigNumber(0);

    // Assert the amount of liquidity gauge tokens in the vault increased
    expect(postClaimRewardsLiquidityGaugeTokenBalance).toBeGtBigNumber(preClaimRewardsLiquidityGaugeTokenBalance);
  });
});

describe('claimRewardsAndSwap', () => {
  it('claimed amounts only: claim rewards and swap only the amounts claimed of each reward token (to WETH)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const integrationManager = fork.deployment.integrationManager;
    const crv = new StandardToken(fork.config.primitives.crv, whales.crv);
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const incomingAsset = weth;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Lend and stake to start accruing rewards
    const seedDaiAmount = utils.parseEther('2');
    await dai.transfer(vaultProxy, seedDaiAmount);
    await curveAaveLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
      outgoingAaveDaiAmount: seedDaiAmount,
      useUnderlyings: true,
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
      account: curveLiquidityAaveAdapter,
    });

    // Approve the adapter to use CRV
    await curveApproveAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      adapter: curveLiquidityAaveAdapter,
      assets: [fork.config.primitives.crv, stkAave],
    });

    // Claim all earned rewards and swap to the incoming asset
    await curveAaveClaimRewardsAndSwap({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
      useFullBalances: false,
      incomingAsset,
    });

    const [postClaimRewardsCrvBalance, postClaimRewardsIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv, incomingAsset],
    });

    // Assert only the newly claimed balances of reward tokens were used
    expect(postClaimRewardsCrvBalance).toEqBigNumber(preClaimRewardsCrvBalance);

    // Assert no rewards tokens are remaining in the adapter
    expect(await crv.balanceOf(curveLiquidityAaveAdapter)).toEqBigNumber(0);

    // Assert the amount of incoming asset in the vault increased
    expect(postClaimRewardsIncomingAssetBalance).toBeGtBigNumber(preClaimRewardsIncomingAssetBalance);
  });

  it('full balances: claim rewards and swap the full vault balances of each reward token (to DAI)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const integrationManager = fork.deployment.integrationManager;
    const crv = new StandardToken(fork.config.primitives.crv, whales.crv);
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const incomingAsset = dai;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Lend and stake to start accruing rewards
    const seedDaiAmount = utils.parseEther('2');
    await dai.transfer(vaultProxy, seedDaiAmount);
    await curveAaveLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
      outgoingAaveDaiAmount: seedDaiAmount,
      useUnderlyings: true,
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
      account: curveLiquidityAaveAdapter,
    });

    // Approve the adapter to use CRV
    await curveApproveAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      adapter: curveLiquidityAaveAdapter,
      assets: [fork.config.primitives.crv, stkAave],
    });

    // Claim all earned rewards and swap to the incoming asset
    await curveAaveClaimRewardsAndSwap({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
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
    expect(await crv.balanceOf(curveLiquidityAaveAdapter)).toEqBigNumber(0);

    // Assert the amount of liquidity gauge tokens in the vault increased
    expect(postClaimRewardsIncomingAssetBalance).toBeGtBigNumber(preClaimRewardsIncomingAssetBalance);
  });
});

describe('lend', () => {
  it('works as expected (three spend assets, underlyings)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
    const usdc = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    const usdt = new StandardToken(fork.config.primitives.usdt, whales.usdt);
    const lpToken = new StandardToken(fork.config.curve.pools.aave.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
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
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
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

  // TODO: Some problem with rebasing tokens and the evm reverts
  xit('works as expected (one spend asset, not underlying)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const integrationManager = fork.deployment.integrationManager;
    const usdc = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    const ausdc = new StandardToken(fork.config.aave.atokens.ausdc[0], provider);
    const lpToken = new StandardToken(fork.config.curve.pools.aave.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    // Seed fund with surplus of outgoing asset
    const seedUsdcAmount = utils.parseUnits('3', await usdc.decimals());
    await usdc.transfer(vaultProxy, seedUsdcAmount);
    await aaveLend({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      aaveAdapter: fork.deployment.aaveAdapter,
      aToken: ausdc,
      amount: seedUsdcAmount,
    });

    const [preTxAaveUsdcBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [ausdc],
    });

    const outgoingAaveUsdcAmount = preTxAaveUsdcBalance.div(4);

    await curveAaveLend({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
      outgoingAaveUsdcAmount,
      useUnderlyings: false, // Unnecessary, but explicit for test
    });

    const [postTxAaveUsdcBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [ausdc, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxAaveUsdcBalance).toEqBigNumber(preTxAaveUsdcBalance.sub(outgoingAaveUsdcAmount));

    // TODO: get expected incoming amount
    expect(postTxLpTokenBalance).toBeGtBigNumber(0);
  });
});

describe('lendAndStake', () => {
  it('works as expected (three spend assets, underlyings)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
    const usdc = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    const usdt = new StandardToken(fork.config.primitives.usdt, whales.usdt);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.aave.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
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
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
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

  // TODO: Some problem with rebasing tokens and the evm reverts
  xit('works as expected (one spend asset, not underlying)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const integrationManager = fork.deployment.integrationManager;
    const usdc = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    const ausdc = new StandardToken(fork.config.aave.atokens.ausdc[0], provider);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.aave.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    // Seed fund with surplus of outgoing asset
    const seedUsdcAmount = utils.parseUnits('3', await usdc.decimals());
    await usdc.transfer(vaultProxy, seedUsdcAmount);
    await aaveLend({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      aaveAdapter: fork.deployment.aaveAdapter,
      aToken: ausdc,
      amount: seedUsdcAmount,
    });

    const [preTxAaveUsdcBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [ausdc],
    });

    const outgoingAaveUsdcAmount = preTxAaveUsdcBalance.div(4);

    await curveAaveLendAndStake({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
      outgoingAaveUsdcAmount,
      useUnderlyings: false, // Unnecessary, but explicit for test
    });

    const [postTxAaveUsdcBalance, postTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [ausdc, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxAaveUsdcBalance).toEqBigNumber(preTxAaveUsdcBalance.sub(outgoingAaveUsdcAmount));

    // TODO: get expected incoming amount
    expect(postTxLiquidityGaugeTokenBalance).toBeGtBigNumber(0);
  });
});

describe('redeem', () => {
  it('works as expected (no single-asset, no underlying)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
    const adai = new StandardToken(fork.config.aave.atokens.adai[0], provider);
    const ausdc = new StandardToken(fork.config.aave.atokens.ausdc[0], provider);
    const ausdt = new StandardToken(fork.config.aave.atokens.ausdt[0], provider);
    const lpToken = new StandardToken(fork.config.curve.pools.aave.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    // Seed fund with lp tokens
    const seedDaiAmount = utils.parseEther('2');
    await dai.transfer(vaultProxy, seedDaiAmount);
    await curveAaveLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
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
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
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
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    // Seed fund with lp tokens
    const seedDaiAmount = utils.parseEther('2');
    await dai.transfer(vaultProxy, seedDaiAmount);
    await curveAaveLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
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
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
      outgoingLPTokenAmount,
      minIncomingAaveDaiAmount: BigNumber.from(0),
      minIncomingAaveUsdtAmount: BigNumber.from(0),
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

describe('unstakeAndRedeem', () => {
  it('works as expected (no single-asset, no underlying)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
    const adai = new StandardToken(fork.config.aave.atokens.adai[0], provider);
    const ausdc = new StandardToken(fork.config.aave.atokens.ausdc[0], provider);
    const ausdt = new StandardToken(fork.config.aave.atokens.ausdt[0], provider);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.aave.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    // Seed fund with liquidity gauge tokens
    const seedDaiAmount = utils.parseEther('2');
    await dai.transfer(vaultProxy, seedDaiAmount);
    await curveAaveLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
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
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
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
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    // Seed fund with liquidity gauge tokens
    const seedDaiAmount = utils.parseEther('2');
    await dai.transfer(vaultProxy, seedDaiAmount);
    await curveAaveLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
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
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
      outgoingLiquidityGaugeTokenAmount,
      minIncomingAaveDaiAmount: BigNumber.from(0),
      minIncomingAaveUsdtAmount: BigNumber.from(0),
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

describe('stake and unstake', () => {
  it('correctly handles staking and then unstaking partial balances', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityAaveAdapter = fork.deployment.curveLiquidityAaveAdapter;
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.aave.liquidityGaugeToken, provider);
    const lpToken = new StandardToken(fork.config.curve.pools.aave.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    // Seed fund with lp tokens
    const seedDaiAmount = utils.parseEther('2');
    await dai.transfer(vaultProxy, seedDaiAmount);
    await curveAaveLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
      outgoingAaveDaiAmount: seedDaiAmount,
      useUnderlyings: true,
    });

    // Stake the LP tokens
    const preStakeTxLpTokenBalance = await lpToken.balanceOf(vaultProxy);
    const stakeLPTokenAmount = preStakeTxLpTokenBalance.div(2);

    await curveAaveStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
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
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityAaveAdapter,
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
