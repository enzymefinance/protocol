import type { AddressLike } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  ComptrollerLib,
  ConvexCurveLpStakingAdapter,
  IntegrationManager,
  VaultLib,
} from '@enzymefinance/protocol';
import { curveIncomingAssetsDataRedeemStandardArgs, CurveRedeemType, StandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  addNewAssetsToFund,
  createNewFund,
  curveClaimRewards,
  curveLendAndStake,
  curveStake,
  curveUnstake,
  curveUnstakeAndRedeem,
  deployProtocolFixture,
  getAssetBalances,
  getAssetUnit,
} from '@enzymefinance/testutils';

let fork: ProtocolDeployment;
let convexCurveLpStakingAdapter: ConvexCurveLpStakingAdapter;
beforeEach(async () => {
  fork = await deployProtocolFixture();
  convexCurveLpStakingAdapter = fork.deployment.convexCurveLpStakingAdapter;
});

// @file Uses curve helper utils and namespaces since the payloads are the same

describe('parseAssetsForMethod', () => {
  it.todo('negative tests');
});

// Uses steth pool throughout
describe('actions', () => {
  let integrationManager: IntegrationManager;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let fundOwner: SignerWithAddress;
  let pool: AddressLike, lpToken: StandardToken, stakingWrapperToken: StandardToken;
  let weth: StandardToken, steth: StandardToken;
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

    pool = fork.config.curve.pools.steth.pool;
    lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, whales.stecrv);
    weth = new StandardToken(fork.config.wrappedNativeAsset, whales.weth);
    steth = new StandardToken(fork.config.lido.steth, whales.lidoSteth);

    // TODO: make distinction between valid and invalid cases?
    // Deploy wrapper
    const pid = 25; // steth
    const convexCurveLpStakingWrapperFactory = fork.deployment.convexCurveLpStakingWrapperFactory;
    await convexCurveLpStakingWrapperFactory.deploy(pid);

    stakingWrapperToken = new StandardToken(
      await convexCurveLpStakingWrapperFactory.getWrapperForConvexPool(pid),
      provider,
    );

    // Add wrapper to the asset universe
    await fork.deployment.valueInterpreter.addDerivatives(
      [stakingWrapperToken],
      [fork.deployment.convexCurveLpStakingWrapperPriceFeed],
    );
  });

  describe('claimRewards', () => {
    it('happy path (pool with CRV + pool rewards)', async () => {
      const crvToken = new StandardToken(fork.config.convex.crvToken, provider);
      const cvxToken = new StandardToken(fork.config.convex.cvxToken, provider);
      const ldoToken = new StandardToken(fork.config.primitives.ldo, provider);

      // Stake
      const lpTokenAmount = (await getAssetUnit(lpToken)).mul(10);
      await lpToken.transfer(vaultProxy, lpTokenAmount);
      await curveStake({
        amount: lpTokenAmount,
        comptrollerProxy,
        curveLiquidityAdapter: convexCurveLpStakingAdapter as any,
        incomingStakingToken: stakingWrapperToken,
        integrationManager,
        pool,
        signer: fundOwner,
      });

      // Warp ahead in time to accrue significant rewards
      await provider.send('evm_increaseTime', [60 * 60 * 24]);

      // Claim all earned rewards
      const receipt = await curveClaimRewards({
        comptrollerProxy,
        curveLiquidityAdapter: convexCurveLpStakingAdapter as any,
        fundOwner,
        integrationManager,
        stakingToken: stakingWrapperToken,
      });

      // Assert vault balances of reward tokens have increased
      expect(await crvToken.balanceOf(vaultProxy)).toBeGtBigNumber(0);
      expect(await cvxToken.balanceOf(vaultProxy)).toBeGtBigNumber(0);
      expect(await ldoToken.balanceOf(vaultProxy)).toBeGtBigNumber(0);

      expect(receipt).toCostAround(699487);
    });
  });

  describe('lendAndStake', () => {
    it.todo('test negative cases, if any');

    it('works as expected', async () => {
      const wethAmount = 123;
      const stethAmount = 456;

      // Seed vault
      await addNewAssetsToFund({
        amounts: [wethAmount, stethAmount],
        assets: [weth, steth],
        comptrollerProxy,
        integrationManager,
        signer: fundOwner,
      });

      const receipt = await curveLendAndStake({
        comptrollerProxy,
        curveLiquidityAdapter: convexCurveLpStakingAdapter as any,
        incomingStakingToken: stakingWrapperToken,
        integrationManager,
        orderedOutgoingAssetAmounts: [wethAmount, stethAmount],
        pool,
        signer: fundOwner,
        useUnderlyings: false,
      });

      expect(await stakingWrapperToken.balanceOf(vaultProxy)).toBeGtBigNumber(0);

      // All of the outgoing assets should have been used
      expect(await weth.balanceOf(vaultProxy)).toEqBigNumber(0);
      expect(await steth.balanceOf(vaultProxy)).toEqBigNumber(0);

      expect(receipt).toCostAround(1505299);
    });
  });

  describe('stake', () => {
    it.todo('test negative cases, if any');

    it('works as expected', async () => {
      const lpTokenAmount = (await getAssetUnit(lpToken)).mul(10);
      await lpToken.transfer(vaultProxy, lpTokenAmount);

      const receipt = await curveStake({
        amount: lpTokenAmount,
        comptrollerProxy,
        curveLiquidityAdapter: convexCurveLpStakingAdapter as any,
        incomingStakingToken: stakingWrapperToken,
        integrationManager,
        pool,
        signer: fundOwner,
      });

      // All lpToken should be converted into gauge token
      expect(await stakingWrapperToken.balanceOf(vaultProxy)).toEqBigNumber(lpTokenAmount);

      expect(receipt).toCostAround(1255869);
    });
  });

  describe('unstake', () => {
    it.todo('test negative cases, if any');

    it('works as expected', async () => {
      // Stake
      const lpTokenAmount = (await getAssetUnit(lpToken)).mul(10);
      await lpToken.transfer(vaultProxy, lpTokenAmount);
      await curveStake({
        amount: lpTokenAmount,
        comptrollerProxy,
        curveLiquidityAdapter: convexCurveLpStakingAdapter as any,
        incomingStakingToken: stakingWrapperToken,
        integrationManager,
        pool,
        signer: fundOwner,
      });

      const preTxStakingTokenBalance = await stakingWrapperToken.balanceOf(vaultProxy);
      const unstakeAmount = preTxStakingTokenBalance.div(4);

      const receipt = await curveUnstake({
        amount: unstakeAmount,
        comptrollerProxy,
        curveLiquidityAdapter: convexCurveLpStakingAdapter as any,
        integrationManager,
        outgoingStakingToken: stakingWrapperToken,
        pool,
        signer: fundOwner,
      });

      expect(await stakingWrapperToken.balanceOf(vaultProxy)).toEqBigNumber(
        preTxStakingTokenBalance.sub(unstakeAmount),
      );
      expect(await lpToken.balanceOf(vaultProxy)).toEqBigNumber(unstakeAmount);

      expect(receipt).toCostAround(1427289);
    });
  });

  // No need to re-test behavior underlyings, wrapped native asset, or multiple redemption types, which are tested in redeem()
  describe('unstakeAndRedeem', () => {
    it.todo('test negative cases, if any');

    it('works as expected', async () => {
      // Stake
      const lpTokenAmount = (await getAssetUnit(lpToken)).mul(10);
      await lpToken.transfer(vaultProxy, lpTokenAmount);
      await curveStake({
        amount: lpTokenAmount,
        comptrollerProxy,
        curveLiquidityAdapter: convexCurveLpStakingAdapter as any,
        incomingStakingToken: stakingWrapperToken,
        integrationManager,
        pool,
        signer: fundOwner,
      });

      const [preTxStakingTokenBalance, preTxWethBalance, preTxStethBalance] = await getAssetBalances({
        account: vaultProxy,
        assets: [stakingWrapperToken, weth, steth],
      });
      const outgoingStakingTokenAmount = preTxStakingTokenBalance.div(4);

      const receipt = await curveUnstakeAndRedeem({
        comptrollerProxy,
        curveLiquidityAdapter: convexCurveLpStakingAdapter as any,
        incomingAssetData: curveIncomingAssetsDataRedeemStandardArgs({
          orderedMinIncomingAssetAmounts: [0, 0],
        }),
        integrationManager,
        outgoingStakingToken: stakingWrapperToken,
        outgoingStakingTokenAmount,
        pool,
        redeemType: CurveRedeemType.Standard,
        signer: fundOwner,
        useUnderlyings: false,
      });

      const [postTxStakingTokenBalance, postTxWethBalance, postTxStethBalance] = await getAssetBalances({
        account: vaultProxy,
        assets: [stakingWrapperToken, weth, steth],
      });

      expect(postTxStakingTokenBalance).toEqBigNumber(preTxStakingTokenBalance.sub(outgoingStakingTokenAmount));

      // All of the incoming asset balances should have increased
      expect(postTxWethBalance).toBeGtBigNumber(preTxWethBalance);
      expect(postTxStethBalance).toBeGtBigNumber(preTxStethBalance);

      expect(receipt).toCostAround(1698812);
    });
  });
});
