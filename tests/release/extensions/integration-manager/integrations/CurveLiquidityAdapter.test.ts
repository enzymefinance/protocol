import type { AddressLike } from '@enzymefinance/ethers';
import { randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, CurveLiquidityAdapter, IntegrationManager, VaultLib } from '@enzymefinance/protocol';
import {
  claimRewardsSelector,
  curveIncomingAssetsDataRedeemOneCoinArgs,
  curveIncomingAssetsDataRedeemStandardArgs,
  curveLendAndStakeArgs,
  curveLendArgs,
  curveRedeemArgs,
  CurveRedeemType,
  curveStakeArgs,
  curveUnstakeAndRedeemArgs,
  curveUnstakeArgs,
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
  addNewAssetsToFund,
  createNewFund,
  curveClaimRewards,
  curveLend,
  curveLendAndStake,
  curveRedeem,
  curveStake,
  curveUnstake,
  curveUnstakeAndRedeem,
  deployProtocolFixture,
  getAssetBalances,
  getAssetUnit,
  vaultCallCurveMinterToggleApproveMint,
} from '@enzymefinance/testutils';
import type { BigNumber } from 'ethers';
import { constants, utils } from 'ethers';

let fork: ProtocolDeployment;
let curveLiquidityAdapter: CurveLiquidityAdapter;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  curveLiquidityAdapter = fork.deployment.curveLiquidityAdapter;
});

describe('constructor', () => {
  it('sets state vars', async () => {
    // AdapterBase
    expect(await curveLiquidityAdapter.getIntegrationManager()).toMatchAddress(fork.deployment.integrationManager);

    // CurveGaugeV2RewardsHandlerMixin
    expect(await curveLiquidityAdapter.getCurveGaugeV2RewardsHandlerCrvToken()).toMatchAddress(
      fork.config.primitives.crv,
    );
    expect(await curveLiquidityAdapter.getCurveGaugeV2RewardsHandlerMinter()).toMatchAddress(fork.config.curve.minter);

    // CurveLiquidityActionsMixin
    expect(await curveLiquidityAdapter.getCurveLiquidityWrappedNativeAsset()).toMatchAddress(
      fork.config.wrappedNativeAsset,
    );
  });
});

// Uses aave pool for all cases
describe('parseAssetsForAction', () => {
  let dai: AddressLike, usdc: AddressLike, usdt: AddressLike;
  let aDai: AddressLike, aUsdc: AddressLike, aUsdt: AddressLike;
  let gaugeToken: AddressLike,
    lpToken: AddressLike,
    orderedPoolAssets: AddressLike[],
    orderedPoolUnderlyings: AddressLike[],
    pool: AddressLike;

  beforeEach(async () => {
    aDai = fork.config.aave.atokens.adai[0];
    aUsdc = fork.config.aave.atokens.ausdc[0];
    aUsdt = fork.config.aave.atokens.ausdt[0];
    dai = fork.config.primitives.dai;
    usdc = fork.config.primitives.usdc;
    usdt = fork.config.primitives.usdt;
    gaugeToken = fork.config.curve.pools.aave.liquidityGaugeToken;
    lpToken = fork.config.curve.pools.aave.lpToken;
    orderedPoolAssets = [aDai, aUsdc, aUsdt];
    orderedPoolUnderlyings = [dai, usdc, usdt];
    pool = fork.config.curve.pools.aave.pool;
  });

  it('does not allow a bad selector', async () => {
    await expect(
      curveLiquidityAdapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), constants.HashZero),
    ).rejects.toBeRevertedWith('_selector invalid');
  });

  describe('claimRewards', () => {
    it('generates expected output', async () => {
      const result = await curveLiquidityAdapter.parseAssetsForAction(
        randomAddress(),
        claimRewardsSelector,
        constants.HashZero,
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAdapter.parseAssetsForAction, {
        incomingAssets_: [],
        minIncomingAssetAmounts_: [],
        spendAssetAmounts_: [],
        spendAssetsHandleType_: SpendAssetsHandleType.None,
        spendAssets_: [],
      });
    });
  });

  describe('lend', () => {
    // TODO: check underlyings also
    it.todo('negative cases');

    it('generates expected output', async () => {
      const aDaiAmount = 123;
      const aUsdtAmount = 456;
      const minIncomingLpTokenAmount = 789;

      const result = await curveLiquidityAdapter.parseAssetsForAction(
        randomAddress(),
        lendSelector,
        curveLendArgs({
          minIncomingLpTokenAmount,
          orderedOutgoingAssetAmounts: [aDaiAmount, 0, aUsdtAmount],
          pool,
          useUnderlyings: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAdapter.parseAssetsForAction, {
        incomingAssets_: [lpToken],
        minIncomingAssetAmounts_: [minIncomingLpTokenAmount],
        spendAssetAmounts_: [aDaiAmount, aUsdtAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [aDai, aUsdt],
      });
    });
  });

  describe('lendAndStake', () => {
    it.todo('negative cases');

    it('generates expected output', async () => {
      const aDaiAmount = 123;
      const aUsdtAmount = 456;
      const minIncomingStakingTokenAmount = 789;

      const result = await curveLiquidityAdapter.parseAssetsForAction(
        randomAddress(),
        lendAndStakeSelector,
        curveLendAndStakeArgs({
          incomingStakingToken: gaugeToken,
          minIncomingStakingTokenAmount,
          orderedOutgoingAssetAmounts: [aDaiAmount, 0, aUsdtAmount],
          pool,
          useUnderlyings: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAdapter.parseAssetsForAction, {
        incomingAssets_: [gaugeToken],
        minIncomingAssetAmounts_: [minIncomingStakingTokenAmount],
        spendAssetAmounts_: [aDaiAmount, aUsdtAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [aDai, aUsdt],
      });
    });
  });

  describe('redeem', () => {
    // TODO: check underlyings also
    it.todo('negative cases');

    describe('RedeemType.Standard', () => {
      it('no underlyings: generates expected output', async () => {
        const outgoingLpTokenAmount = 789;
        const orderedMinIncomingAssetAmounts = [123, 0, 234];

        const result = await curveLiquidityAdapter.parseAssetsForAction(
          randomAddress(),
          redeemSelector,
          curveRedeemArgs({
            incomingAssetData: curveIncomingAssetsDataRedeemStandardArgs({
              orderedMinIncomingAssetAmounts,
            }),
            outgoingLpTokenAmount,
            pool,
            redeemType: CurveRedeemType.Standard,
            useUnderlyings: false,
          }),
        );

        expect(result).toMatchFunctionOutput(curveLiquidityAdapter.parseAssetsForAction, {
          incomingAssets_: orderedPoolAssets,
          minIncomingAssetAmounts_: orderedMinIncomingAssetAmounts,
          spendAssetAmounts_: [outgoingLpTokenAmount],
          spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
          spendAssets_: [lpToken],
        });
      });

      it('underlyings: generates expected output', async () => {
        const outgoingLpTokenAmount = 789;
        const orderedMinIncomingAssetAmounts = [123, 0, 234];

        const result = await curveLiquidityAdapter.parseAssetsForAction(
          randomAddress(),
          redeemSelector,
          curveRedeemArgs({
            incomingAssetData: curveIncomingAssetsDataRedeemStandardArgs({
              orderedMinIncomingAssetAmounts,
            }),
            outgoingLpTokenAmount,
            pool,
            redeemType: CurveRedeemType.Standard,
            useUnderlyings: true,
          }),
        );

        expect(result).toMatchFunctionOutput(curveLiquidityAdapter.parseAssetsForAction, {
          incomingAssets_: orderedPoolUnderlyings,
          minIncomingAssetAmounts_: orderedMinIncomingAssetAmounts,
          spendAssetAmounts_: [outgoingLpTokenAmount],
          spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
          spendAssets_: [lpToken],
        });
      });
    });

    describe('RedeemType.OneCoin', () => {
      it('no underlyings: generates expected output', async () => {
        const outgoingLpTokenAmount = 789;
        const minIncomingAssetAmount = 123;

        const result = await curveLiquidityAdapter.parseAssetsForAction(
          randomAddress(),
          redeemSelector,
          curveRedeemArgs({
            incomingAssetData: curveIncomingAssetsDataRedeemOneCoinArgs({
              incomingAssetPoolIndex: 1, // aUSDC
              minIncomingAssetAmount,
            }),
            outgoingLpTokenAmount,
            pool,
            redeemType: CurveRedeemType.OneCoin,
            useUnderlyings: false,
          }),
        );

        expect(result).toMatchFunctionOutput(curveLiquidityAdapter.parseAssetsForAction, {
          incomingAssets_: [aUsdc],
          minIncomingAssetAmounts_: [minIncomingAssetAmount],
          spendAssetAmounts_: [outgoingLpTokenAmount],
          spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
          spendAssets_: [lpToken],
        });
      });

      it('underlyings: generates expected output', async () => {
        const outgoingLpTokenAmount = 789;
        const minIncomingAssetAmount = 123;

        const result = await curveLiquidityAdapter.parseAssetsForAction(
          randomAddress(),
          redeemSelector,
          curveRedeemArgs({
            incomingAssetData: curveIncomingAssetsDataRedeemOneCoinArgs({
              incomingAssetPoolIndex: 1, // USDC
              minIncomingAssetAmount,
            }),
            outgoingLpTokenAmount,
            pool,
            redeemType: CurveRedeemType.OneCoin,
            useUnderlyings: true,
          }),
        );

        expect(result).toMatchFunctionOutput(curveLiquidityAdapter.parseAssetsForAction, {
          incomingAssets_: [usdc],
          minIncomingAssetAmounts_: [minIncomingAssetAmount],
          spendAssetAmounts_: [outgoingLpTokenAmount],
          spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
          spendAssets_: [lpToken],
        });
      });
    });
  });

  describe('stake', () => {
    it.todo('negative cases');

    it('generates expected output', async () => {
      const amount = 123;

      const result = await curveLiquidityAdapter.parseAssetsForAction(
        randomAddress(),
        stakeSelector,
        curveStakeArgs({
          amount,
          incomingStakingToken: gaugeToken,
          pool,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAdapter.parseAssetsForAction, {
        incomingAssets_: [gaugeToken],
        minIncomingAssetAmounts_: [amount],
        spendAssetAmounts_: [amount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [lpToken],
      });
    });
  });

  describe('unstake', () => {
    it.todo('negative cases');

    it('generates expected output', async () => {
      const amount = 123;

      const result = await curveLiquidityAdapter.parseAssetsForAction(
        randomAddress(),
        unstakeSelector,
        curveUnstakeArgs({
          amount,
          outgoingStakingToken: gaugeToken,
          pool,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityAdapter.parseAssetsForAction, {
        incomingAssets_: [lpToken],
        minIncomingAssetAmounts_: [amount],
        spendAssetAmounts_: [amount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [gaugeToken],
      });
    });
  });

  describe('unstakeAndRedeem', () => {
    it.todo('negative cases');

    describe('RedeemType.Standard', () => {
      it('no underlyings: generates expected output', async () => {
        const outgoingStakingTokenAmount = 789;
        const orderedMinIncomingAssetAmounts = [123, 0, 234];

        const result = await curveLiquidityAdapter.parseAssetsForAction(
          randomAddress(),
          unstakeAndRedeemSelector,
          curveUnstakeAndRedeemArgs({
            incomingAssetData: curveIncomingAssetsDataRedeemStandardArgs({
              orderedMinIncomingAssetAmounts,
            }),
            outgoingStakingToken: gaugeToken,
            outgoingStakingTokenAmount,
            pool,
            redeemType: CurveRedeemType.Standard,
            useUnderlyings: false,
          }),
        );

        expect(result).toMatchFunctionOutput(curveLiquidityAdapter.parseAssetsForAction, {
          incomingAssets_: orderedPoolAssets,
          minIncomingAssetAmounts_: orderedMinIncomingAssetAmounts,
          spendAssetAmounts_: [outgoingStakingTokenAmount],
          spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
          spendAssets_: [gaugeToken],
        });
      });

      it('underlyings: generates expected output', async () => {
        const outgoingStakingTokenAmount = 789;
        const orderedMinIncomingAssetAmounts = [123, 0, 234];

        const result = await curveLiquidityAdapter.parseAssetsForAction(
          randomAddress(),
          unstakeAndRedeemSelector,
          curveUnstakeAndRedeemArgs({
            incomingAssetData: curveIncomingAssetsDataRedeemStandardArgs({
              orderedMinIncomingAssetAmounts,
            }),
            outgoingStakingToken: gaugeToken,
            outgoingStakingTokenAmount,
            pool,
            redeemType: CurveRedeemType.Standard,
            useUnderlyings: true,
          }),
        );

        expect(result).toMatchFunctionOutput(curveLiquidityAdapter.parseAssetsForAction, {
          incomingAssets_: orderedPoolUnderlyings,
          minIncomingAssetAmounts_: orderedMinIncomingAssetAmounts,
          spendAssetAmounts_: [outgoingStakingTokenAmount],
          spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
          spendAssets_: [gaugeToken],
        });
      });
    });

    describe('RedeemType.OneCoin', () => {
      it('no underlyings: generates expected output', async () => {
        const outgoingStakingTokenAmount = 789;
        const minIncomingAssetAmount = 123;

        const result = await curveLiquidityAdapter.parseAssetsForAction(
          randomAddress(),
          unstakeAndRedeemSelector,
          curveUnstakeAndRedeemArgs({
            incomingAssetData: curveIncomingAssetsDataRedeemOneCoinArgs({
              incomingAssetPoolIndex: 1, // aUSDC
              minIncomingAssetAmount,
            }),
            outgoingStakingToken: gaugeToken,
            outgoingStakingTokenAmount,
            pool,
            redeemType: CurveRedeemType.OneCoin,
            useUnderlyings: false,
          }),
        );

        expect(result).toMatchFunctionOutput(curveLiquidityAdapter.parseAssetsForAction, {
          incomingAssets_: [aUsdc],
          minIncomingAssetAmounts_: [minIncomingAssetAmount],
          spendAssetAmounts_: [outgoingStakingTokenAmount],
          spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
          spendAssets_: [gaugeToken],
        });
      });

      it('underlyings: generates expected output', async () => {
        const outgoingStakingTokenAmount = 789;
        const minIncomingAssetAmount = 123;

        const result = await curveLiquidityAdapter.parseAssetsForAction(
          randomAddress(),
          unstakeAndRedeemSelector,
          curveUnstakeAndRedeemArgs({
            incomingAssetData: curveIncomingAssetsDataRedeemOneCoinArgs({
              incomingAssetPoolIndex: 1, // aUSDC
              minIncomingAssetAmount,
            }),
            outgoingStakingToken: gaugeToken,
            outgoingStakingTokenAmount,
            pool,
            redeemType: CurveRedeemType.OneCoin,
            useUnderlyings: true,
          }),
        );

        expect(result).toMatchFunctionOutput(curveLiquidityAdapter.parseAssetsForAction, {
          incomingAssets_: [usdc],
          minIncomingAssetAmounts_: [minIncomingAssetAmount],
          spendAssetAmounts_: [outgoingStakingTokenAmount],
          spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
          spendAssets_: [gaugeToken],
        });
      });
    });
  });
});

describe('actions', () => {
  let integrationManager: IntegrationManager;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let fundOwner: SignerWithAddress;

  beforeEach(async () => {
    integrationManager = fork.deployment.integrationManager;
    [fundOwner] = fork.accounts;

    const newFundRes = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    comptrollerProxy = newFundRes.comptrollerProxy;
    vaultProxy = newFundRes.vaultProxy;
  });

  describe('claimRewards', () => {
    it('happy path (pool with CRV + pool rewards)', async () => {
      const pool = fork.config.curve.pools.steth.pool;
      const gaugeToken = new StandardToken(fork.config.curve.pools.steth.liquidityGaugeToken, provider);
      const weth = new StandardToken(fork.config.wrappedNativeAsset, provider);
      const crv = new StandardToken(fork.config.primitives.crv, provider);
      const ldo = new StandardToken(fork.config.primitives.ldo, provider);

      const wethLendAmount = utils.parseEther('100');

      // Seed vault
      await addNewAssetsToFund({
        provider,
        amounts: [wethLendAmount],
        assets: [weth],
        comptrollerProxy,
        integrationManager,
        signer: fundOwner,
      });

      // Lend and stake to start accruing rewards
      await curveLendAndStake({
        comptrollerProxy,
        curveLiquidityAdapter,
        incomingStakingToken: gaugeToken,
        integrationManager,
        orderedOutgoingAssetAmounts: [wethLendAmount, 0],
        pool,
        signer: fundOwner,
        useUnderlyings: false,
      });
      expect(await gaugeToken.balanceOf(vaultProxy)).toBeGtBigNumber(0);

      // Warp ahead in time to accrue significant rewards
      await provider.send('evm_increaseTime', [86400]);

      // Approve the adapter to claim $CRV rewards on behalf of the vault
      await vaultCallCurveMinterToggleApproveMint({
        account: curveLiquidityAdapter,
        comptrollerProxy,
        minter: fork.config.curve.minter,
      });

      // Vault balances of reward tokens should be 0
      expect(await crv.balanceOf(vaultProxy)).toEqBigNumber(0);
      expect(await ldo.balanceOf(vaultProxy)).toEqBigNumber(0);

      // Claim all earned rewards
      await curveClaimRewards({
        comptrollerProxy,
        curveLiquidityAdapter,
        fundOwner,
        integrationManager,
        stakingToken: gaugeToken,
      });

      // Assert vault balances of reward tokens have increased
      expect(await crv.balanceOf(vaultProxy)).toBeGtBigNumber(0);
      expect(await ldo.balanceOf(vaultProxy)).toBeGtBigNumber(0);
    });
  });

  // TODO: figure out how to do these tests iteratively for every pool we want to support
  describe('lend', () => {
    it.todo('test negative cases, if any');

    describe('aave pool: 3 assets, underlyings', () => {
      let pool: AddressLike;
      let lpToken: StandardToken;

      beforeEach(async () => {
        pool = fork.config.curve.pools.aave.pool;
        lpToken = new StandardToken(fork.config.curve.pools.aave.lpToken, provider);
      });

      it('works as expected (non-underlyings, 2 of 3 outgoing)', async () => {
        const aUsdc = new StandardToken(fork.config.aave.atokens.ausdc[0], provider);
        const aUsdt = new StandardToken(fork.config.aave.atokens.ausdt[0], provider);
        const aUsdcAmount = 123;
        const aUsdtAmount = 456;

        // Seed vault
        await addNewAssetsToFund({
          provider,
          amounts: [aUsdcAmount, aUsdtAmount],
          assets: [aUsdc, aUsdt],
          comptrollerProxy,
          integrationManager,
          signer: fundOwner,
        });

        const preaUsdcBalance = await aUsdc.balanceOf(vaultProxy);
        const preaUsdtBalance = await aUsdt.balanceOf(vaultProxy);

        await curveLend({
          comptrollerProxy,
          curveLiquidityAdapter,
          integrationManager,
          orderedOutgoingAssetAmounts: [0, aUsdcAmount, aUsdtAmount],
          pool,
          signer: fundOwner,
          useUnderlyings: false,
        });

        const postaUsdcBalance = await aUsdc.balanceOf(vaultProxy);
        const postaUsdtBalance = await aUsdt.balanceOf(vaultProxy);

        expect(await lpToken.balanceOf(vaultProxy)).toBeGtBigNumber(0);

        // All of the outgoing assets should have been used; check diff since tokens are rebasing
        expect(preaUsdcBalance.sub(postaUsdcBalance)).toBeAroundBigNumber(aUsdcAmount, 1);
        expect(preaUsdtBalance.sub(postaUsdtBalance)).toBeAroundBigNumber(aUsdtAmount, 1);
      });

      it('works as expected (underlyings, 2 of 3 outgoing)', async () => {
        const dai = new StandardToken(fork.config.primitives.dai, provider);
        const usdt = new StandardToken(fork.config.primitives.usdt, provider);
        const daiAmount = 123;
        const usdtAmount = 456;

        // Seed vault
        await addNewAssetsToFund({
          provider,
          amounts: [daiAmount, usdtAmount],
          assets: [dai, usdt],
          comptrollerProxy,
          integrationManager,
          signer: fundOwner,
        });

        await curveLend({
          comptrollerProxy,
          curveLiquidityAdapter,
          integrationManager,
          orderedOutgoingAssetAmounts: [daiAmount, 0, usdtAmount],
          pool,
          signer: fundOwner,
          useUnderlyings: true,
        });

        expect(await lpToken.balanceOf(vaultProxy)).toBeGtBigNumber(0);

        // All of the outgoing assets should have been used; allow room for aToken rounding
        expect(await dai.balanceOf(vaultProxy)).toBeLteBigNumber(1);
        expect(await usdt.balanceOf(vaultProxy)).toBeLteBigNumber(1);
      });
    });

    describe('steth pool: 2 assets, eth', () => {
      it('works as expected (2 assets, incl eth)', async () => {
        const pool = fork.config.curve.pools.steth.pool;
        const lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, provider);
        const weth = new StandardToken(fork.config.wrappedNativeAsset, provider);
        const steth = new StandardToken(fork.config.lido.steth, provider);
        const wethAmount = 123;
        const stethAmount = 456;

        // Seed vault
        await addNewAssetsToFund({
          provider,
          amounts: [wethAmount, stethAmount],
          assets: [weth, steth],
          comptrollerProxy,
          integrationManager,
          signer: fundOwner,
        });

        const preStethBalance = await steth.balanceOf(vaultProxy);

        await curveLend({
          comptrollerProxy,
          curveLiquidityAdapter,
          integrationManager,
          orderedOutgoingAssetAmounts: [wethAmount, stethAmount],
          pool,
          signer: fundOwner,
          useUnderlyings: false,
        });

        const postStethBalance = await steth.balanceOf(vaultProxy);

        expect(await lpToken.balanceOf(vaultProxy)).toBeGtBigNumber(0);

        // All of the outgoing assets should have been used
        expect(await weth.balanceOf(vaultProxy)).toEqBigNumber(0);
        // Since steth is rebasing, seeding increases the balance too much, so we compare pre/post balances
        expect(preStethBalance.sub(postStethBalance)).toBeAroundBigNumber(stethAmount, 1);
      });
    });
    describe('USDT pool (coins(int128) signature)', () => {
      it('works as expected', async () => {
        const pool = fork.config.curve.pools.usdt.pool;
        const lpToken = new StandardToken(fork.config.curve.pools.usdt.lpToken, provider);
        const cDai = new StandardToken(fork.config.compound.ctokens.cdai, provider);
        const cUsdc = new StandardToken(fork.config.compound.ctokens.cusdc, provider);
        const usdt = new StandardToken(fork.config.primitives.usdt, provider);
        const amount = 1000;

        // Seed vault
        await addNewAssetsToFund({
          provider,
          amounts: [amount, amount, amount],
          assets: [cDai, cUsdc, usdt],
          comptrollerProxy,
          integrationManager,
          signer: fundOwner,
        });

        await curveLend({
          comptrollerProxy,
          curveLiquidityAdapter,
          integrationManager,
          orderedOutgoingAssetAmounts: [amount, amount, amount],
          pool,
          signer: fundOwner,
          useUnderlyings: false,
        });

        expect(await lpToken.balanceOf(vaultProxy)).toBeGtBigNumber(0);
      });
    });
  });

  // No need to re-test behavior of underlyings or wrapped native asset, which are tested in lend()
  describe('lendAndStake', () => {
    it.todo('test negative cases, if any');

    it('works as expected', async () => {
      const pool = fork.config.curve.pools.steth.pool;
      const gaugeToken = new StandardToken(fork.config.curve.pools.steth.liquidityGaugeToken, provider);
      const weth = new StandardToken(fork.config.wrappedNativeAsset, provider);
      const steth = new StandardToken(fork.config.lido.steth, provider);
      const wethAmount = 123;
      const stethAmount = 456;

      // Seed vault
      await addNewAssetsToFund({
        provider,
        amounts: [wethAmount, stethAmount],
        assets: [weth, steth],
        comptrollerProxy,
        integrationManager,
        signer: fundOwner,
      });

      const preStethBalance = await steth.balanceOf(vaultProxy);

      await curveLendAndStake({
        comptrollerProxy,
        curveLiquidityAdapter,
        incomingStakingToken: gaugeToken,
        integrationManager,
        orderedOutgoingAssetAmounts: [wethAmount, stethAmount],
        pool,
        signer: fundOwner,
        useUnderlyings: false,
      });

      const postStethBalance = await steth.balanceOf(vaultProxy);

      expect(await gaugeToken.balanceOf(vaultProxy)).toBeGtBigNumber(0);

      // All of the outgoing assets should have been used
      expect(await weth.balanceOf(vaultProxy)).toEqBigNumber(0);
      // Since steth is rebasing, seeding increases the balance too much, so we compare pre/post balances
      expect(preStethBalance.sub(postStethBalance)).toBeAroundBigNumber(stethAmount, 1);
    });
  });

  describe('redeem', () => {
    it.todo('test negative cases, if any');

    describe('aave pool: 3 assets, underlyings', () => {
      let pool: AddressLike;
      let lpToken: StandardToken;
      let dai: StandardToken, usdc: StandardToken, usdt: StandardToken;
      let aDai: StandardToken, aUsdc: StandardToken, aUsdt: StandardToken;
      let preTxLpTokenBalance: BigNumber, outgoingLpTokenAmount: BigNumber;

      beforeEach(async () => {
        pool = fork.config.curve.pools.aave.pool;
        lpToken = new StandardToken(fork.config.curve.pools.aave.lpToken, provider);
        aDai = new StandardToken(fork.config.aave.atokens.adai[0], provider);
        aUsdc = new StandardToken(fork.config.aave.atokens.ausdc[0], provider);
        aUsdt = new StandardToken(fork.config.aave.atokens.ausdt[0], provider);
        dai = new StandardToken(fork.config.primitives.dai, provider);
        usdc = new StandardToken(fork.config.primitives.usdc, provider);
        usdt = new StandardToken(fork.config.primitives.usdt, provider);

        const aUsdcSeedAmount = await getAssetUnit(aUsdc);

        // Seed vault
        await addNewAssetsToFund({
          provider,
          amounts: [aUsdcSeedAmount],
          assets: [aUsdc],
          comptrollerProxy,
          integrationManager,
          signer: fundOwner,
        });

        await curveLend({
          comptrollerProxy,
          curveLiquidityAdapter,
          integrationManager,
          orderedOutgoingAssetAmounts: [0, aUsdcSeedAmount, 0],
          pool,
          signer: fundOwner,
          useUnderlyings: false,
        });

        preTxLpTokenBalance = await lpToken.balanceOf(vaultProxy);
        outgoingLpTokenAmount = preTxLpTokenBalance.div(4);
      });

      describe('RedeemType: Standard', () => {
        it('non-underlyings: works as expected', async () => {
          const [preTxADaiBalance, preTxAUsdcBalance, preTxAUsdtBalance] = await getAssetBalances({
            account: vaultProxy,
            assets: [aDai, aUsdc, aUsdt],
          });

          await curveRedeem({
            comptrollerProxy,
            curveLiquidityAdapter,
            incomingAssetData: curveIncomingAssetsDataRedeemStandardArgs({
              orderedMinIncomingAssetAmounts: [0, 0, 0],
            }),
            integrationManager,
            outgoingLpTokenAmount,
            pool,
            redeemType: CurveRedeemType.Standard,
            signer: fundOwner,
            useUnderlyings: false,
          });

          const [postTxLpTokenBalance, postTxADaiBalance, postTxAUsdcBalance, postTxAUsdtBalance] =
            await getAssetBalances({
              account: vaultProxy,
              assets: [lpToken, aDai, aUsdc, aUsdt],
            });

          expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLpTokenAmount));

          // All of the incoming asset balances should have increased
          expect(postTxADaiBalance).toBeGtBigNumber(preTxADaiBalance);
          expect(postTxAUsdcBalance).toBeGtBigNumber(preTxAUsdcBalance);
          expect(postTxAUsdtBalance).toBeGtBigNumber(preTxAUsdtBalance);
        });

        it('underlyings: works as expected', async () => {
          await curveRedeem({
            comptrollerProxy,
            curveLiquidityAdapter,
            incomingAssetData: curveIncomingAssetsDataRedeemStandardArgs({
              orderedMinIncomingAssetAmounts: [0, 0, 0],
            }),
            integrationManager,
            outgoingLpTokenAmount,
            pool,
            redeemType: CurveRedeemType.Standard,
            signer: fundOwner,
            useUnderlyings: true,
          });

          const [postTxLpTokenBalance, postTxDaiBalance, postTxUsdcBalance, postTxUsdtBalance] = await getAssetBalances(
            {
              account: vaultProxy,
              assets: [lpToken, dai, usdc, usdt],
            },
          );

          expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLpTokenAmount));

          // All of the incoming asset balances should have increased
          expect(postTxDaiBalance).toBeGtBigNumber(0);
          expect(postTxUsdcBalance).toBeGtBigNumber(0);
          expect(postTxUsdtBalance).toBeGtBigNumber(0);
        });
      });

      describe('RedeemType: OneCoin', () => {
        it('non-underlyings: works as expected', async () => {
          const [preTxADaiBalance, preTxAUsdcBalance, preTxAUsdtBalance] = await getAssetBalances({
            account: vaultProxy,
            assets: [aDai, aUsdc, aUsdt],
          });

          await curveRedeem({
            comptrollerProxy,
            curveLiquidityAdapter,
            incomingAssetData: curveIncomingAssetsDataRedeemOneCoinArgs({
              incomingAssetPoolIndex: 2, // aUSDT
              minIncomingAssetAmount: 0,
            }),
            integrationManager,
            outgoingLpTokenAmount,
            pool,
            redeemType: CurveRedeemType.OneCoin,
            signer: fundOwner,
            useUnderlyings: false,
          });

          const [postTxLpTokenBalance, postTxADaiBalance, postTxAUsdcBalance, postTxAUsdtBalance] =
            await getAssetBalances({
              account: vaultProxy,
              assets: [lpToken, aDai, aUsdc, aUsdt],
            });

          expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLpTokenAmount));

          // The one coin specified should have its balance increased
          expect(postTxAUsdtBalance).toBeGtBigNumber(preTxAUsdtBalance);

          // Remaining asset balances should remain the same
          expect(postTxADaiBalance).toEqBigNumber(preTxADaiBalance);
          expect(postTxAUsdcBalance).toEqBigNumber(preTxAUsdcBalance);

          // No asset balances should remain in the adapter (only need to validate unused assets)
          expect(await aDai.balanceOf(curveLiquidityAdapter)).toEqBigNumber(0);
          expect(await aUsdc.balanceOf(curveLiquidityAdapter)).toEqBigNumber(0);
        });

        it('underlyings: works as expected', async () => {
          await curveRedeem({
            comptrollerProxy,
            curveLiquidityAdapter,
            incomingAssetData: curveIncomingAssetsDataRedeemOneCoinArgs({
              incomingAssetPoolIndex: 2, // USDT
              minIncomingAssetAmount: 0,
            }),
            integrationManager,
            outgoingLpTokenAmount,
            pool,
            redeemType: CurveRedeemType.OneCoin,
            signer: fundOwner,
            useUnderlyings: true,
          });

          const [postTxLpTokenBalance, postTxDaiBalance, postTxUsdcBalance, postTxUsdtBalance] = await getAssetBalances(
            {
              account: vaultProxy,
              assets: [lpToken, dai, usdc, usdt],
            },
          );

          expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLpTokenAmount));

          // The one coin specified should have its balance increased
          expect(postTxUsdtBalance).toBeGtBigNumber(0);

          // Remaining asset balances should remain the same
          expect(postTxDaiBalance).toEqBigNumber(0);
          expect(postTxUsdcBalance).toEqBigNumber(0);

          // No asset balances should remain in the adapter (only need to validate unused assets)
          expect(await dai.balanceOf(curveLiquidityAdapter)).toEqBigNumber(0);
          expect(await usdc.balanceOf(curveLiquidityAdapter)).toEqBigNumber(0);
        });
      });
    });

    describe('steth pool: 2 assets, eth', () => {
      let pool: AddressLike;
      let lpToken: StandardToken;
      let weth: StandardToken, steth: StandardToken;
      let preTxLpTokenBalance: BigNumber,
        preTxWethBalance: BigNumber,
        preTxStethBalance: BigNumber,
        outgoingLpTokenAmount: BigNumber;

      beforeEach(async () => {
        pool = fork.config.curve.pools.steth.pool;
        lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, provider);
        weth = new StandardToken(fork.config.wrappedNativeAsset, provider);
        steth = new StandardToken(fork.config.lido.steth, provider);

        const wethSeedAmount = await getAssetUnit(weth);

        // Seed vault
        await addNewAssetsToFund({
          provider,
          amounts: [wethSeedAmount],
          assets: [weth],
          comptrollerProxy,
          integrationManager,
          signer: fundOwner,
        });

        await curveLend({
          comptrollerProxy,
          curveLiquidityAdapter,
          integrationManager,
          orderedOutgoingAssetAmounts: [wethSeedAmount, 0],
          pool,
          signer: fundOwner,
          useUnderlyings: false,
        });

        [preTxLpTokenBalance, preTxWethBalance, preTxStethBalance] = await getAssetBalances({
          account: vaultProxy,
          assets: [lpToken, weth, steth],
        });
        outgoingLpTokenAmount = preTxLpTokenBalance.div(4);
      });

      describe('RedeemType: Standard', () => {
        it('works as expected', async () => {
          await curveRedeem({
            comptrollerProxy,
            curveLiquidityAdapter,
            incomingAssetData: curveIncomingAssetsDataRedeemStandardArgs({
              orderedMinIncomingAssetAmounts: [0, 0],
            }),
            integrationManager,
            outgoingLpTokenAmount,
            pool,
            redeemType: CurveRedeemType.Standard,
            signer: fundOwner,
            useUnderlyings: false,
          });

          const [postTxLpTokenBalance, postTxWethBalance, postTxStethBalance] = await getAssetBalances({
            account: vaultProxy,
            assets: [lpToken, weth, steth],
          });

          expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLpTokenAmount));

          // All of the incoming asset balances should have increased
          expect(postTxWethBalance).toBeGtBigNumber(preTxWethBalance);
          expect(postTxStethBalance).toBeGtBigNumber(preTxStethBalance);
        });
      });

      describe('RedeemType: OneCoin', () => {
        it('weth: works as expected', async () => {
          await curveRedeem({
            comptrollerProxy,
            curveLiquidityAdapter,
            incomingAssetData: curveIncomingAssetsDataRedeemOneCoinArgs({
              incomingAssetPoolIndex: 0, // ETH
              minIncomingAssetAmount: 0,
            }),
            integrationManager,
            outgoingLpTokenAmount,
            pool,
            redeemType: CurveRedeemType.OneCoin,
            signer: fundOwner,
            useUnderlyings: false,
          });

          const [postTxLpTokenBalance, postTxWethBalance, postTxStethBalance] = await getAssetBalances({
            account: vaultProxy,
            assets: [lpToken, weth, steth],
          });

          expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLpTokenAmount));

          // The one coin specified should have its balance increased
          expect(postTxWethBalance).toBeGtBigNumber(preTxWethBalance);

          // Remaining asset balances should remain the same
          expect(postTxStethBalance).toEqBigNumber(preTxStethBalance);

          // No asset balances should remain in the adapter (only need to validate unused assets)
          expect(await steth.balanceOf(curveLiquidityAdapter)).toEqBigNumber(0);
        });
      });
    });
  });

  describe('stake', () => {
    it.todo('test negative cases, if any');

    it('works as expected', async () => {
      const pool = fork.config.curve.pools.steth.pool;
      const lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, provider);
      const gaugeToken = new StandardToken(fork.config.curve.pools.steth.liquidityGaugeToken, provider);
      const weth = new StandardToken(fork.config.wrappedNativeAsset, provider);
      const steth = new StandardToken(fork.config.lido.steth, provider);
      const wethSeedAmount = 123;
      const stethSeedAmount = 456;

      // Seed vault
      await addNewAssetsToFund({
        provider,
        amounts: [wethSeedAmount, stethSeedAmount],
        assets: [weth, steth],
        comptrollerProxy,
        integrationManager,
        signer: fundOwner,
      });

      await curveLend({
        comptrollerProxy,
        curveLiquidityAdapter,
        integrationManager,
        orderedOutgoingAssetAmounts: [wethSeedAmount, stethSeedAmount],
        pool,
        signer: fundOwner,
        useUnderlyings: false,
      });

      const preStakeLpTokenBalance = await lpToken.balanceOf(vaultProxy);

      expect(preStakeLpTokenBalance).toBeGtBigNumber(0);

      await curveStake({
        amount: preStakeLpTokenBalance,
        comptrollerProxy,
        curveLiquidityAdapter,
        incomingStakingToken: gaugeToken,
        integrationManager,
        pool,
        signer: fundOwner,
      });

      // All lpToken should be converted into gauge token
      expect(await gaugeToken.balanceOf(vaultProxy)).toEqBigNumber(preStakeLpTokenBalance);
    });
  });

  describe('unstake', () => {
    it.todo('test negative cases, if any');

    it('works as expected', async () => {
      const pool = fork.config.curve.pools.steth.pool;
      const lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, provider);
      const gaugeToken = new StandardToken(fork.config.curve.pools.steth.liquidityGaugeToken, provider);
      const weth = new StandardToken(fork.config.wrappedNativeAsset, provider);
      const steth = new StandardToken(fork.config.lido.steth, provider);
      const wethSeedAmount = 123;
      const stethSeedAmount = 456;

      // Seed vault
      await addNewAssetsToFund({
        provider,
        amounts: [wethSeedAmount, stethSeedAmount],
        assets: [weth, steth],
        comptrollerProxy,
        integrationManager,
        signer: fundOwner,
      });

      await curveLendAndStake({
        comptrollerProxy,
        curveLiquidityAdapter,
        incomingStakingToken: gaugeToken,
        integrationManager,
        orderedOutgoingAssetAmounts: [wethSeedAmount, stethSeedAmount],
        pool,
        signer: fundOwner,
        useUnderlyings: false,
      });

      const preTxGaugeTokenBalance = await gaugeToken.balanceOf(vaultProxy);
      const unstakeAmount = preTxGaugeTokenBalance.div(4);

      await curveUnstake({
        amount: unstakeAmount,
        comptrollerProxy,
        curveLiquidityAdapter,
        integrationManager,
        outgoingStakingToken: gaugeToken,
        pool,
        signer: fundOwner,
      });

      expect(await gaugeToken.balanceOf(vaultProxy)).toEqBigNumber(preTxGaugeTokenBalance.sub(unstakeAmount));
      expect(await lpToken.balanceOf(vaultProxy)).toEqBigNumber(unstakeAmount);
    });
  });

  // No need to re-test behavior underlyings, wrapped native asset, or multiple redemption types, which are tested in redeem()
  describe('unstakeAndRedeem', () => {
    it.todo('test negative cases, if any');

    it('works as expected', async () => {
      const pool = fork.config.curve.pools.steth.pool;
      const gaugeToken = new StandardToken(fork.config.curve.pools.steth.liquidityGaugeToken, provider);
      const weth = new StandardToken(fork.config.wrappedNativeAsset, provider);
      const steth = new StandardToken(fork.config.lido.steth, provider);

      const wethSeedAmount = await getAssetUnit(weth);

      // Seed vault
      await addNewAssetsToFund({
        provider,
        amounts: [wethSeedAmount],
        assets: [weth],
        comptrollerProxy,
        integrationManager,
        signer: fundOwner,
      });

      await curveLendAndStake({
        comptrollerProxy,
        curveLiquidityAdapter,
        incomingStakingToken: gaugeToken,
        integrationManager,
        orderedOutgoingAssetAmounts: [wethSeedAmount, 0],
        pool,
        signer: fundOwner,
        useUnderlyings: false,
      });

      const [preTxGaugeTokenBalance, preTxWethBalance, preTxStethBalance] = await getAssetBalances({
        account: vaultProxy,
        assets: [gaugeToken, weth, steth],
      });
      const outgoingStakingTokenAmount = preTxGaugeTokenBalance.div(4);

      await curveUnstakeAndRedeem({
        comptrollerProxy,
        curveLiquidityAdapter,
        incomingAssetData: curveIncomingAssetsDataRedeemStandardArgs({
          orderedMinIncomingAssetAmounts: [0, 0],
        }),
        integrationManager,
        outgoingStakingToken: gaugeToken,
        outgoingStakingTokenAmount,
        pool,
        redeemType: CurveRedeemType.Standard,
        signer: fundOwner,
        useUnderlyings: false,
      });

      const [postTxGaugeTokenBalance, postTxWethBalance, postTxStethBalance] = await getAssetBalances({
        account: vaultProxy,
        assets: [gaugeToken, weth, steth],
      });

      expect(postTxGaugeTokenBalance).toEqBigNumber(preTxGaugeTokenBalance.sub(outgoingStakingTokenAmount));

      // All of the incoming asset balances should have increased
      expect(postTxWethBalance).toBeGtBigNumber(preTxWethBalance);
      expect(postTxStethBalance).toBeGtBigNumber(preTxStethBalance);
    });
  });
});
