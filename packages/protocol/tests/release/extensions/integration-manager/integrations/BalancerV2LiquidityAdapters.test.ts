import type { AddressLike } from '@enzymefinance/ethers';
import { randomAddress } from '@enzymefinance/ethers';
import type {
  BalancerV2BatchSwapStep,
  BalancerV2LiquidityAdapter,
  ComptrollerLib,
  IntegrationManager,
  ValueInterpreter,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  balancerV2GetPoolFromId,
  balancerV2LendArgs,
  balancerV2RedeemArgs,
  balancerV2StablePoolsUserDataExactBptInForTokensOut,
  balancerV2StablePoolsUserDataTokenInForExactBptOut,
  BalancerV2SwapKind,
  balancerV2WeightedPoolsUserDataBptInForExactTokensOut,
  balancerV2WeightedPoolsUserDataExactBptInForOneTokenOut,
  balancerV2WeightedPoolsUserDataExactBptInForTokensOut,
  balancerV2WeightedPoolsUserDataExactTokensInForBptOut,
  balancerV2WeightedPoolsUserDataTokenInForExactBptOut,
  ITestBalancerV2Helpers,
  ITestBalancerV2Vault,
  ITestStandardToken,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  balancerV2ClaimRewards,
  balancerV2ConstructRequest,
  balancerV2Lend,
  balancerV2LendAndStake,
  balancerV2Redeem,
  balancerV2Stake,
  balancerV2TakeOrder,
  balancerV2Unstake,
  balancerV2UnstakeAndRedeem,
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  getAssetUnit,
  setAccountBalance,
  vaultCallCurveMinterToggleApproveMint,
} from '@enzymefinance/testutils';
import type { BigNumberish, BytesLike } from 'ethers';
import { BigNumber, constants, utils } from 'ethers';

// TODO: Get the extra reward token seeded and running again on Bal+Aura

let fork: ProtocolDeployment;
let valueInterpreter: ValueInterpreter;
let balancerV2LiquidityAdapter: BalancerV2LiquidityAdapter;
let balancerVaultAddress: AddressLike;
let poolId: BytesLike, bpt: ITestStandardToken, stakingToken: ITestStandardToken;
let poolAssets: ITestStandardToken[];
// let extraRewardToken: ITestStandardToken;

const adapterKeys = ['balancer', 'aura'];
describe.each(adapterKeys)('%s as adapter', (adapterKey) => {
  beforeEach(async () => {
    fork = await deployProtocolFixture();
    valueInterpreter = fork.deployment.valueInterpreter;
    balancerVaultAddress = fork.config.balancer.vault;
    const balancerVault = new ITestBalancerV2Vault(balancerVaultAddress, provider);

    // stable pool: wstETH [wstETH, WETH]
    poolId = fork.config.balancer.poolsStable.pools.steth.id;
    bpt = new ITestStandardToken(balancerV2GetPoolFromId(poolId), provider);
    // TODO: grab dynamically
    // extraRewardToken = new ITestStandardToken(fork.config.primitives.ldo, provider);

    const poolAssetAddresses = (await balancerVault.getPoolTokens(poolId)).tokens_;
    poolAssets = poolAssetAddresses.map((poolAssetAddress) => new ITestStandardToken(poolAssetAddress, provider));

    // Adapter-specific vars
    switch (adapterKey) {
      case 'balancer':
        balancerV2LiquidityAdapter = fork.deployment.balancerV2LiquidityAdapter;
        stakingToken = new ITestStandardToken(fork.config.balancer.poolsStable.pools.steth.gauge, provider);
        break;
      case 'aura':
        balancerV2LiquidityAdapter = fork.deployment.auraBalancerV2LpStakingAdapter as BalancerV2LiquidityAdapter;

        // Deploy a staking wrapper for the Aura pool
        const pid = 29; // wstETH
        const factory = fork.deployment.auraBalancerV2LpStakingWrapperFactory;
        await factory.deploy(pid);
        stakingToken = new ITestStandardToken(await factory.getWrapperForConvexPool(pid), provider);

        // Add the staking token to the asset universe
        await valueInterpreter.addDerivatives(
          [stakingToken],
          [fork.deployment.auraBalancerV2LpStakingWrapperPriceFeed],
        );

        break;
    }
  });

  describe('parseAssetsForAction', () => {
    it('does not allow a bad selector', async () => {
      await expect(
        balancerV2LiquidityAdapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), '0x'),
      ).rejects.toBeRevertedWith('_selector invalid');
    });

    it.todo('other actions');

    describe('takeOrder', () => {
      it.todo('does not allow an invalid staking token');
    });

    describe('actions', () => {
      let integrationManager: IntegrationManager;
      let balancerHelpers: ITestBalancerV2Helpers;
      let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
      let fundOwner: SignerWithAddress;

      beforeEach(async () => {
        [fundOwner] = fork.accounts;

        integrationManager = fork.deployment.integrationManager;

        balancerHelpers = new ITestBalancerV2Helpers(fork.config.balancer.helpers, provider);

        const newFundRes = await createNewFund({
          denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, fork.deployer),
          fundDeployer: fork.deployment.fundDeployer,
          fundOwner,
          signer: fork.deployer,
        });
        comptrollerProxy = newFundRes.comptrollerProxy;
        vaultProxy = newFundRes.vaultProxy;
      });

      describe('lendAndStake', () => {
        // Use an option that only partially spends outgoing tokens to confirm no tokens are stuck in adapter
        it('happy path: TOKEN_IN_FOR_EXACT_BPT_OUT', async () => {
          const spendAssetIndex = 1; // WETH
          const spendAsset = poolAssets[spendAssetIndex];
          const maxSpendAssetAmount = (await getAssetUnit(spendAsset)).mul(100);

          // Must be small relative to maxSpendAssetAmount value
          const incomingBptAmount = (
            await valueInterpreter.calcCanonicalAssetValue.args(spendAsset, maxSpendAssetAmount, bpt).call()
          ).div(3);

          const userData = balancerV2StablePoolsUserDataTokenInForExactBptOut({
            bptAmountOut: incomingBptAmount,
            tokenIndex: spendAssetIndex,
          });

          const request = await balancerV2ConstructRequest({
            provider,
            balancerVaultAddress,
            poolId,
            limits: poolAssets.map((asset, i) => (i === spendAssetIndex ? maxSpendAssetAmount : 0)),
            userData,
          });

          const { amountsIn_ } = await balancerHelpers.queryJoin
            .args(poolId, balancerV2LiquidityAdapter, vaultProxy, request)
            .call();

          expect(amountsIn_[0]).toEqBigNumber(0);
          expect(amountsIn_[spendAssetIndex]).toBeBetweenBigNumber(1, maxSpendAssetAmount);

          for (const i in poolAssets.splice(spendAssetIndex, 1)) {
            expect(amountsIn_[i]).toEqBigNumber(0);
          }

          // Seed fund with spendAsset
          await setAccountBalance({
            account: vaultProxy,
            amount: maxSpendAssetAmount,
            provider,
            token: spendAsset,
          });

          const receipt = await balancerV2LendAndStake({
            comptrollerProxy,
            vaultProxy,
            integrationManager,
            fundOwner,
            balancerV2LiquidityAdapter,
            stakingToken,
            poolId,
            minIncomingBptAmount: 0,
            spendAssets: [spendAsset],
            spendAssetAmounts: [maxSpendAssetAmount],
            request,
          });

          expect(await stakingToken.balanceOf(vaultProxy)).toEqBigNumber(incomingBptAmount);

          // None of the spend asset should remain in the adapter
          expect(await spendAsset.balanceOf(balancerV2LiquidityAdapter)).toEqBigNumber(0);

          expect(receipt).toMatchGasSnapshot(adapterKey);
        });
      });

      describe('stake', () => {
        it('happy path', async () => {
          // Seed the vault with some BPT
          await setAccountBalance({
            account: vaultProxy,
            amount: (await getAssetUnit(bpt)).mul(10),
            provider,
            token: bpt,
          });

          // Stake a portion of received BPT
          const preStakeBpt = await bpt.balanceOf(vaultProxy);
          const stakeAmount = preStakeBpt.div(3);
          expect(stakeAmount).toBeGtBigNumber(0);

          const receipt = await balancerV2Stake({
            comptrollerProxy,
            integrationManager,
            fundOwner,
            balancerV2LiquidityAdapter,
            stakingToken,
            bptAmount: stakeAmount,
          });

          const [postStakeBpt, postStakeStakingToken] = await getAssetBalances({
            account: vaultProxy,
            assets: [bpt, stakingToken],
          });

          expect(postStakeBpt).toEqBigNumber(preStakeBpt.sub(stakeAmount));
          expect(postStakeStakingToken).toEqBigNumber(stakeAmount);

          expect(receipt).toMatchGasSnapshot(adapterKey);
        });
      });

      describe('unstake', () => {
        it('happy path', async () => {
          // Seed the vault with some BPT
          await setAccountBalance({
            account: vaultProxy,
            amount: (await getAssetUnit(bpt)).mul(10),
            provider,
            token: bpt,
          });

          // Stake a portion of received BPT
          await balancerV2Stake({
            comptrollerProxy,
            integrationManager,
            fundOwner,
            balancerV2LiquidityAdapter,
            stakingToken,
            bptAmount: (await bpt.balanceOf(vaultProxy)).div(3),
          });

          const [preUnstakeBpt, preUnstakeStakingToken] = await getAssetBalances({
            account: vaultProxy,
            assets: [bpt, stakingToken],
          });

          // Unstake a portion of staked BPT
          const unstakeAmount = preUnstakeStakingToken.div(5);
          expect(unstakeAmount).toBeGtBigNumber(0);

          const receipt = await balancerV2Unstake({
            comptrollerProxy,
            integrationManager,
            fundOwner,
            balancerV2LiquidityAdapter,
            stakingToken,
            bptAmount: unstakeAmount,
          });

          const [postUnstakeBpt, postUnstakeStakingToken] = await getAssetBalances({
            account: vaultProxy,
            assets: [bpt, stakingToken],
          });

          expect(postUnstakeBpt).toEqBigNumber(preUnstakeBpt.add(unstakeAmount));
          expect(postUnstakeStakingToken).toEqBigNumber(preUnstakeStakingToken.sub(unstakeAmount));

          expect(receipt).toMatchGasSnapshot(adapterKey);
        });
      });

      describe('unstakeAndRedeem', () => {
        // TODO: Use an option that only partially spends outgoing tokens to confirm no tokens are stuck in adapter
        // (this is not an option for the wstETH pool)
        it('happy path: BPT_IN_FOR_EXACT_TOKENS_OUT', async () => {
          // Seed the vault with some BPT and stake
          await setAccountBalance({
            account: vaultProxy,
            amount: (await getAssetUnit(bpt)).mul(10),
            provider,
            token: bpt,
          });

          const initialStakingTokenBalance = await bpt.balanceOf(vaultProxy);

          await balancerV2Stake({
            comptrollerProxy,
            integrationManager,
            fundOwner,
            balancerV2LiquidityAdapter,
            stakingToken,
            bptAmount: initialStakingTokenBalance,
          });

          // Partially redeem staking tokens
          const redeemStakingTokenAmount = initialStakingTokenBalance.div(5);
          expect(redeemStakingTokenAmount).not.toEqBigNumber(BigNumber.from(0));

          const minIncomingAssetAmounts = poolAssets.map(() => 1);

          const userData = balancerV2StablePoolsUserDataExactBptInForTokensOut({
            bptAmountIn: redeemStakingTokenAmount,
          });

          const request = await balancerV2ConstructRequest({
            provider,
            balancerVaultAddress,
            poolId,
            limits: minIncomingAssetAmounts,
            userData,
          });

          // Calc expected amount of tokens to receive
          const { amountsOut_: expectedIncomingAmounts } = await balancerHelpers.queryExit
            .args(poolId, balancerV2LiquidityAdapter, vaultProxy, request)
            .call();

          // Get pre-redeem balances of all tokens
          const preTxPoolAssetBalances = await getAssetBalances({
            account: vaultProxy,
            assets: poolAssets,
          });

          const receipt = await balancerV2UnstakeAndRedeem({
            comptrollerProxy,
            integrationManager,
            fundOwner,
            balancerV2LiquidityAdapter,
            stakingToken,
            poolId,
            bptAmount: redeemStakingTokenAmount,
            incomingAssets: poolAssets,
            minIncomingAssetAmounts,
            request,
          });

          // Get post-redeem balances of all tokens
          const postTxPoolAssetBalances = await getAssetBalances({
            account: vaultProxy,
            assets: poolAssets,
          });

          // Assert the exact amounts of incoming tokens expected
          for (const i in poolAssets) {
            expect(postTxPoolAssetBalances[i]).toEqBigNumber(preTxPoolAssetBalances[i].add(expectedIncomingAmounts[i]));
          }

          // Assert the staked token balance decreased correctly
          expect(await stakingToken.balanceOf(vaultProxy)).toEqBigNumber(
            initialStakingTokenBalance.sub(redeemStakingTokenAmount),
          );

          expect(receipt).toMatchGasSnapshot(adapterKey);
        });
      });

      describe('claimRewards', () => {
        it('happy path', async () => {
          // Seed the vault with some BPT
          await setAccountBalance({
            account: vaultProxy,
            amount: (await getAssetUnit(bpt)).mul(10),
            provider,
            token: bpt,
          });

          const bal = new ITestStandardToken(fork.config.balancer.balToken, provider);

          expect(await bal.balanceOf(vaultProxy)).toEqBigNumber(0);

          // Stake all BPT to start accruing rewards
          await balancerV2Stake({
            comptrollerProxy,
            integrationManager,
            fundOwner,
            balancerV2LiquidityAdapter,
            stakingToken,
            bptAmount: await bpt.balanceOf(vaultProxy),
          });

          await balancerV2Unstake({
            comptrollerProxy,
            integrationManager,
            fundOwner,
            balancerV2LiquidityAdapter,
            stakingToken,
            bptAmount: 1,
          });

          // Warp ahead in time to accrue significant rewards
          await provider.send('evm_increaseTime', [86400]);

          // Approve the adapter to claim $BAL rewards on behalf of the vault
          await vaultCallCurveMinterToggleApproveMint({
            account: balancerV2LiquidityAdapter,
            comptrollerProxy: comptrollerProxy.connect(fundOwner),
            minter: fork.config.balancer.minter,
          });

          // Vault balances of reward tokens should be 0
          expect(await bal.balanceOf(vaultProxy)).toEqBigNumber(0);
          // TODO: Need to seed the extra reward token on Bal/Aura to get this working
          // expect(await extraRewardToken.balanceOf(vaultProxy)).toEqBigNumber(0);

          // Claim all earned rewards
          await balancerV2ClaimRewards({
            comptrollerProxy,
            balancerV2LiquidityAdapter,
            fundOwner,
            integrationManager,
            stakingToken,
          });

          // Assert vault balances of reward tokens have increased
          expect(await bal.balanceOf(vaultProxy)).toBeGtBigNumber(0);
          // TODO: Need to seed the extra reward token on Bal/Aura to get this working
          // expect(await extraRewardToken.balanceOf(vaultProxy)).toBeGtBigNumber(0);
        });
      });

      describe('takeOrder', () => {
        const swapTolerance = 0.01; // 1%

        it('does not allow an asset with `limit = 0` to have an incoming balance', async () => {
          const outgoingAsset = poolAssets[0];
          const incomingAsset = poolAssets[1];

          const outgoingAssetAmount = (await getAssetUnit(outgoingAsset)).mul(11);

          // Balancer inputs
          const assets = [outgoingAsset, incomingAsset];
          // Limit of 0 for the incoming asset should fail
          const limits = [outgoingAssetAmount, 0];

          await expect(
            balancerV2TakeOrder({
              signer: fundOwner,
              comptrollerProxy,
              integrationManager,
              balancerV2LiquidityAdapter,
              swapKind: BalancerV2SwapKind.GIVEN_IN,
              swaps: [
                {
                  poolId,
                  assetInIndex: assets.findIndex((asset) => asset === outgoingAsset),
                  assetOutIndex: assets.findIndex((asset) => asset === incomingAsset),
                  amount: outgoingAssetAmount,
                  userData: '0x',
                },
              ],
              assets,
              limits,
              provider,
              seedFund: true,
            }),
          ).rejects.toBeRevertedWith('leftover intermediary');
        });

        it('happy path: one swap', async () => {
          const outgoingAsset = poolAssets[0];
          const incomingAsset = poolAssets[1];

          const outgoingAssetAmount = (await getAssetUnit(outgoingAsset)).mul(11);
          const outgoingAssetValueInIncomingAsset = await valueInterpreter.calcCanonicalAssetValue
            .args(outgoingAsset, outgoingAssetAmount, incomingAsset)
            .call();

          // Balancer inputs
          const assets = [outgoingAsset, incomingAsset];
          const limits = [outgoingAssetAmount, -1];

          const receipt = await balancerV2TakeOrder({
            signer: fundOwner,
            comptrollerProxy,
            integrationManager,
            balancerV2LiquidityAdapter,
            swapKind: BalancerV2SwapKind.GIVEN_IN,
            swaps: [
              {
                poolId,
                assetInIndex: assets.findIndex((asset) => asset === outgoingAsset),
                assetOutIndex: assets.findIndex((asset) => asset === incomingAsset),
                amount: outgoingAssetAmount,
                userData: '0x',
              },
            ],
            assets,
            limits,
            provider,
            seedFund: true,
          });

          // Validate vault received roughly the value of the outgoing asset
          expect(await incomingAsset.balanceOf(vaultProxy)).toBeAroundBigNumber(
            outgoingAssetValueInIncomingAsset,
            swapTolerance,
          );

          expect(receipt).toMatchGasSnapshot(adapterKey);
        });

        // Tests in this block use different pools than the rest of the tests
        describe('nested composable stable pool', () => {
          let mainPoolId: BytesLike, nestedPoolId: BytesLike;
          let mainPoolBpt: ITestStandardToken, stakingToken: ITestStandardToken, nestedPoolBpt: ITestStandardToken;
          let underlying: ITestStandardToken;

          beforeEach(async () => {
            // Use a specific nested composable stable pool: bb-a-usd (aave boosted)
            mainPoolId = fork.config.balancer.poolsStable.pools.aaveBoosted.id;
            mainPoolBpt = new ITestStandardToken(balancerV2GetPoolFromId(mainPoolId), provider);
            // nestedPoolId = AaveLinearPool - DAI
            nestedPoolId = '0xae37d54ae477268b9997d4161b96b8200755935c000000000000000000000337';
            nestedPoolBpt = new ITestStandardToken(balancerV2GetPoolFromId(nestedPoolId), provider);
            underlying = new ITestStandardToken(fork.config.primitives.dai, provider);

            switch (adapterKey) {
              case 'balancer':
                stakingToken = new ITestStandardToken(
                  fork.config.balancer.poolsStable.pools.aaveBoosted.gauge,
                  provider,
                );
                break;
              case 'aura':
                // Deploy a staking wrapper for the Aura pool
                const pid = 2; // aaveBoosted
                const factory = fork.deployment.auraBalancerV2LpStakingWrapperFactory;
                await factory.deploy(pid);
                stakingToken = new ITestStandardToken(await factory.getWrapperForConvexPool(pid), provider);

                // Add the staking token to the asset universe
                await valueInterpreter.addDerivatives(
                  [stakingToken],
                  [fork.deployment.auraBalancerV2LpStakingWrapperPriceFeed],
                );

                break;
            }
          });

          describe('lend', () => {
            let assets: AddressLike[];
            let limits: BigNumberish[];
            let swaps: BalancerV2BatchSwapStep[];
            let outgoingAssetValueInMainPoolBpt: BigNumberish;
            beforeEach(async () => {
              // Swap outgoingAsset => nestedPoolBpt => mainPoolBpt
              const outgoingAsset = underlying;
              const outgoingAssetAmount = (await getAssetUnit(outgoingAsset)).mul(11);

              // Balancer inputs
              // All assets used in the pathway are listed (ordering not important)
              // An intermediary asset that is to be completely used should have limit of `0`
              assets = [outgoingAsset, nestedPoolBpt, mainPoolBpt];
              limits = [outgoingAssetAmount, 0, -1];

              swaps = [
                // Swap 1: outgoingAsset => nestedPoolBpt
                {
                  poolId: nestedPoolId,
                  assetInIndex: assets.findIndex((asset) => asset === outgoingAsset),
                  assetOutIndex: assets.findIndex((asset) => asset === nestedPoolBpt),
                  amount: outgoingAssetAmount,
                  userData: '0x',
                },
                // Swap 2: nestedPoolBpt => mainPoolBpt
                // An intermediary asset that is to be completely used should have `0` as its `amount`
                {
                  poolId: mainPoolId,
                  assetInIndex: assets.findIndex((asset) => asset === nestedPoolBpt),
                  assetOutIndex: assets.findIndex((asset) => asset === mainPoolBpt),
                  amount: 0,
                  userData: '0x',
                },
              ];

              outgoingAssetValueInMainPoolBpt = await valueInterpreter.calcCanonicalAssetValue
                .args(outgoingAsset, outgoingAssetAmount, mainPoolBpt)
                .call();
            });

            it('happy path: without staking', async () => {
              const receipt = await balancerV2TakeOrder({
                signer: fundOwner,
                comptrollerProxy,
                integrationManager,
                balancerV2LiquidityAdapter,
                swapKind: BalancerV2SwapKind.GIVEN_IN,
                swaps,
                assets,
                limits,
                provider,
                seedFund: true,
              });

              expect(await mainPoolBpt.balanceOf(vaultProxy)).toBeAroundBigNumber(
                outgoingAssetValueInMainPoolBpt,
                swapTolerance,
              );

              expect(receipt).toMatchGasSnapshot(adapterKey);
            });

            it('happy path: with staking', async () => {
              const receipt = await balancerV2TakeOrder({
                signer: fundOwner,
                comptrollerProxy,
                integrationManager,
                balancerV2LiquidityAdapter,
                swapKind: BalancerV2SwapKind.GIVEN_IN,
                swaps,
                assets,
                limits,
                stakingTokens: assets.map((asset) => (asset === mainPoolBpt ? stakingToken : constants.AddressZero)),
                provider,
                seedFund: true,
              });

              expect(await stakingToken.balanceOf(vaultProxy)).toBeAroundBigNumber(
                outgoingAssetValueInMainPoolBpt,
                swapTolerance,
              );

              expect(receipt).toMatchGasSnapshot(adapterKey);
            });
          });

          describe('redeem', () => {
            let assets: AddressLike[];
            let limits: BigNumberish[];
            let swaps: BalancerV2BatchSwapStep[];
            let incomingAsset: ITestStandardToken;
            let outgoingBptValueInIncomingAsset: BigNumberish;
            beforeEach(async () => {
              const outgoingBptAmount = (await getAssetUnit(mainPoolBpt)).mul(11);

              await setAccountBalance({
                account: vaultProxy,
                amount: outgoingBptAmount,
                provider,
                token: mainPoolBpt,
              });

              // Swap mainPoolBpt => nestedPoolBpt => incomingAsset
              incomingAsset = underlying;

              // Balancer inputs
              // All assets used in the pathway are listed (ordering not important)
              // An intermediary asset that is to be completely used should have limit of `0`
              assets = [mainPoolBpt, nestedPoolBpt, incomingAsset];
              limits = [outgoingBptAmount, 0, -1];

              swaps = [
                // Swap 1: mainPoolBpt => nestedPoolBpt
                {
                  poolId: mainPoolId,
                  assetInIndex: assets.findIndex((asset) => asset === mainPoolBpt),
                  assetOutIndex: assets.findIndex((asset) => asset === nestedPoolBpt),
                  amount: outgoingBptAmount,
                  userData: '0x',
                },
                // Swap 2: nestedPoolBpt => incomingAsset
                // An intermediary asset that is to be completely used should have `0` as its `amount`
                {
                  poolId: nestedPoolId,
                  assetInIndex: assets.findIndex((asset) => asset === nestedPoolBpt),
                  assetOutIndex: assets.findIndex((asset) => asset === incomingAsset),
                  amount: 0,
                  userData: '0x',
                },
              ];

              outgoingBptValueInIncomingAsset = await valueInterpreter.calcCanonicalAssetValue
                .args(mainPoolBpt, outgoingBptAmount, incomingAsset)
                .call();
            });

            it('happy path: without staking', async () => {
              const receipt = await balancerV2TakeOrder({
                signer: fundOwner,
                comptrollerProxy,
                integrationManager,
                balancerV2LiquidityAdapter,
                swapKind: BalancerV2SwapKind.GIVEN_IN,
                swaps,
                assets,
                limits,
              });

              expect(await incomingAsset.balanceOf(vaultProxy)).toBeAroundBigNumber(
                outgoingBptValueInIncomingAsset,
                swapTolerance,
              );

              expect(await mainPoolBpt.balanceOf(vaultProxy)).toEqBigNumber(0);
              expect(await stakingToken.balanceOf(vaultProxy)).toEqBigNumber(0);

              expect(receipt).toMatchGasSnapshot(adapterKey);
            });

            it('happy path: with staking', async () => {
              // Stake the full vault BPT balance first
              await balancerV2Stake({
                comptrollerProxy,
                integrationManager,
                fundOwner,
                balancerV2LiquidityAdapter,
                stakingToken,
                bptAmount: await mainPoolBpt.balanceOf(vaultProxy),
              });

              const receipt = await balancerV2TakeOrder({
                signer: fundOwner,
                comptrollerProxy,
                integrationManager,
                balancerV2LiquidityAdapter,
                swapKind: BalancerV2SwapKind.GIVEN_IN,
                swaps,
                assets,
                limits,
                stakingTokens: assets.map((asset) => (asset === mainPoolBpt ? stakingToken : constants.AddressZero)),
              });

              expect(await incomingAsset.balanceOf(vaultProxy)).toBeAroundBigNumber(
                outgoingBptValueInIncomingAsset,
                swapTolerance,
              );

              expect(await mainPoolBpt.balanceOf(vaultProxy)).toEqBigNumber(0);
              expect(await stakingToken.balanceOf(vaultProxy)).toEqBigNumber(0);

              expect(receipt).toMatchGasSnapshot(adapterKey);
            });

            it.todo('happy path: re-stakes unused BPT if SwapKind is GIVEN_OUT');
          });
        });
      });
    });
  });

  // TODO: refactor to be more abstract like the above combined tests
  describe('balancer only', () => {
    const poolIndexDai = 1;
    const poolIndexWeth = 2;

    let ohm: ITestStandardToken, dai: ITestStandardToken, weth: ITestStandardToken;

    beforeEach(async () => {
      fork = await deployProtocolFixture();
      balancerVaultAddress = fork.config.balancer.vault;

      // weighted pool: [OHM, DAI, WETH]
      poolId = fork.config.balancer.poolsWeighted.pools.ohm50Dai25Weth25.id;
      bpt = new ITestStandardToken(balancerV2GetPoolFromId(poolId), provider);
      ohm = new ITestStandardToken(fork.config.primitives.ohm, provider);
      dai = new ITestStandardToken(fork.config.primitives.dai, provider);
      weth = new ITestStandardToken(fork.config.weth, provider);
      poolAssets = [ohm, dai, weth];

      balancerV2LiquidityAdapter = fork.deployment.balancerV2LiquidityAdapter;
      stakingToken = new ITestStandardToken(fork.config.balancer.poolsWeighted.pools.ohm50Dai25Weth25.gauge, provider);
    });

    describe('parseAssetsForAction', () => {
      describe('lend', () => {
        // Use "one token in" option to validate that not all tokens in pool are used
        const maxSpendAssetAmounts = [0, 123, 0]; // [OHM, DAI, WETH]
        const incomingBptAmount = 456;
        const userData = balancerV2WeightedPoolsUserDataTokenInForExactBptOut({
          bptAmountOut: incomingBptAmount,
          tokenIndex: poolIndexDai,
        });
        let spendAssets: AddressLike[];

        beforeEach(() => {
          spendAssets = [dai];
        });

        it('does not allow useInternalBalances = true', async () => {
          const request = await balancerV2ConstructRequest({
            provider,
            balancerVaultAddress,
            poolId,
            limits: maxSpendAssetAmounts,
            userData,
            useInternalBalance: true,
          });

          const lendArgs = balancerV2LendArgs({
            poolId,
            minIncomingBptAmount: incomingBptAmount,
            spendAssets,
            spendAssetAmounts: maxSpendAssetAmounts,
            request,
          });

          await expect(
            balancerV2LiquidityAdapter.parseAssetsForAction(randomAddress(), lendSelector, lendArgs),
          ).rejects.toBeRevertedWith('Invalid');
        });

        it('happy path', async () => {
          const request = await balancerV2ConstructRequest({
            provider,
            balancerVaultAddress,
            poolId,
            limits: maxSpendAssetAmounts,
            userData,
          });

          const lendArgs = balancerV2LendArgs({
            poolId,
            minIncomingBptAmount: incomingBptAmount,
            spendAssets,
            spendAssetAmounts: maxSpendAssetAmounts,
            request,
          });

          const result = await balancerV2LiquidityAdapter.parseAssetsForAction(randomAddress(), lendSelector, lendArgs);

          expect(result).toMatchFunctionOutput(balancerV2LiquidityAdapter.parseAssetsForAction, {
            incomingAssets_: [bpt],
            minIncomingAssetAmounts_: [incomingBptAmount],
            spendAssets_: spendAssets,
            spendAssetAmounts_: maxSpendAssetAmounts,
            spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
          });
        });
      });

      describe('redeem', () => {
        // Use "one token out" option to validate that not all tokens in pool are used
        const minIncomingAssetAmounts = [0, 0, 123]; // [OHM, DAI, WETH]
        const maxSpendBptAmount = 456;
        const userData = balancerV2WeightedPoolsUserDataExactBptInForOneTokenOut({
          bptAmountIn: maxSpendBptAmount,
          tokenIndex: poolIndexWeth,
        });
        let incomingAssets: AddressLike[];

        beforeEach(() => {
          incomingAssets = [weth];
        });

        it('does not allow useInternalBalances = true', async () => {
          const request = await balancerV2ConstructRequest({
            provider,
            balancerVaultAddress,
            poolId,
            limits: minIncomingAssetAmounts,
            userData,
            useInternalBalance: true,
          });

          const redeemArgs = balancerV2RedeemArgs({
            poolId,
            bptAmount: maxSpendBptAmount,
            incomingAssets,
            minIncomingAssetAmounts,
            request,
          });

          await expect(
            balancerV2LiquidityAdapter.parseAssetsForAction(randomAddress(), redeemSelector, redeemArgs),
          ).rejects.toBeRevertedWith('Invalid');
        });

        it('happy path', async () => {
          const request = await balancerV2ConstructRequest({
            provider,
            balancerVaultAddress,
            poolId,
            limits: minIncomingAssetAmounts,
            userData,
          });

          const redeemArgs = balancerV2RedeemArgs({
            poolId,
            bptAmount: maxSpendBptAmount,
            incomingAssets,
            minIncomingAssetAmounts,
            request,
          });

          const result = await balancerV2LiquidityAdapter.parseAssetsForAction(
            randomAddress(),
            redeemSelector,
            redeemArgs,
          );

          expect(result).toMatchFunctionOutput(balancerV2LiquidityAdapter.parseAssetsForAction, {
            incomingAssets_: incomingAssets,
            minIncomingAssetAmounts_: minIncomingAssetAmounts,
            spendAssets_: [bpt],
            spendAssetAmounts_: [maxSpendBptAmount],
            spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
          });
        });
      });
    });

    describe('actions', () => {
      let integrationManager: IntegrationManager;
      let balancerHelpers: ITestBalancerV2Helpers;
      let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
      let fundOwner: SignerWithAddress;

      beforeEach(async () => {
        [fundOwner] = fork.accounts;

        integrationManager = fork.deployment.integrationManager;

        balancerHelpers = new ITestBalancerV2Helpers(fork.config.balancer.helpers, provider);

        const newFundRes = await createNewFund({
          denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, fork.deployer),
          fundDeployer: fork.deployment.fundDeployer,
          fundOwner,
          signer: fork.deployer,
        });
        comptrollerProxy = newFundRes.comptrollerProxy;
        vaultProxy = newFundRes.vaultProxy;
      });

      describe('lend', () => {
        it('happy path: Weighted Pool: EXACT_TOKENS_IN_FOR_BPT_OUT', async () => {
          const spendAssets = [ohm, dai, weth];
          const spendAssetAmounts = await Promise.all(
            spendAssets.map(async (asset) => (await getAssetUnit(new ITestStandardToken(asset, provider))).mul(3)),
          );
          const minIncomingBptAmount = 0;

          const userData = balancerV2WeightedPoolsUserDataExactTokensInForBptOut({
            amountsIn: spendAssetAmounts,
            bptOut: minIncomingBptAmount,
          });

          const request = await balancerV2ConstructRequest({
            provider,
            balancerVaultAddress,
            poolId,
            limits: spendAssetAmounts,
            userData,
          });

          const { bptOut_ } = await balancerHelpers.queryJoin
            .args(poolId, balancerV2LiquidityAdapter, vaultProxy, request)
            .call();
          expect(bptOut_).toBeGtBigNumber(0);

          const lendReceipt = await balancerV2Lend({
            comptrollerProxy,
            vaultProxy,
            integrationManager,
            fundOwner,
            balancerV2LiquidityAdapter,
            poolId,
            minIncomingBptAmount: 0,
            spendAssets,
            spendAssetAmounts,
            request,
            provider,
            seedFund: true,
          });

          const [postTxToken1Balance, postTxToken2Balance, postTxPoolTokenBalance] = await getAssetBalances({
            account: vaultProxy,
            assets: [spendAssets[0], spendAssets[1], bpt],
          });

          // Assert the exact amounts of tokens expected
          expect(postTxPoolTokenBalance).toEqBigNumber(bptOut_);
          expect(postTxToken1Balance).toEqBigNumber(0);
          expect(postTxToken2Balance).toEqBigNumber(0);

          expect(lendReceipt).toMatchInlineGasSnapshot('545005');
        });

        it('happy path: Weighted Pool: TOKEN_IN_FOR_EXACT_BPT_OUT', async () => {
          const spendAsset = weth;
          const spendAssetIndex = poolIndexWeth;
          const maxSpendAssetAmount = await getAssetUnit(spendAsset);

          // Must be small relative to maxSpendAssetAmount value
          const incomingBptAmount = 123;

          const userData = balancerV2WeightedPoolsUserDataTokenInForExactBptOut({
            bptAmountOut: incomingBptAmount,
            tokenIndex: spendAssetIndex,
          });

          const request = await balancerV2ConstructRequest({
            provider,
            balancerVaultAddress,
            poolId,
            limits: [0, 0, maxSpendAssetAmount], // [OHM, DAI, WETH]
            userData,
          });

          const { amountsIn_ } = await balancerHelpers.queryJoin
            .args(poolId, balancerV2LiquidityAdapter, vaultProxy, request)
            .call();
          expect(amountsIn_[0]).toEqBigNumber(0);
          expect(amountsIn_[1]).toEqBigNumber(0);
          expect(amountsIn_[2]).toBeBetweenBigNumber(1, maxSpendAssetAmount);

          // Seed fund with spendAsset
          const preTxSpendAssetBalance = maxSpendAssetAmount;
          await setAccountBalance({
            account: vaultProxy,
            amount: preTxSpendAssetBalance,
            provider,
            token: spendAsset,
          });

          const lendReceipt = await balancerV2Lend({
            comptrollerProxy,
            vaultProxy,
            integrationManager,
            fundOwner,
            balancerV2LiquidityAdapter,
            poolId,
            minIncomingBptAmount: 0,
            spendAssets: [spendAsset],
            spendAssetAmounts: [maxSpendAssetAmount],
            request,
          });

          const [postTxSpendAssetBalance, postTxPoolTokenBalance] = await getAssetBalances({
            account: vaultProxy,
            assets: [spendAsset, bpt],
          });

          // Assert the amounts of tokens expected
          expect(postTxPoolTokenBalance).toEqBigNumber(incomingBptAmount);
          expect(postTxSpendAssetBalance).toEqBigNumber(preTxSpendAssetBalance.sub(amountsIn_[spendAssetIndex]));

          expect(lendReceipt).toMatchInlineGasSnapshot('404320');
        });
      });

      describe('redeem', () => {
        beforeEach(async () => {
          // Seed the vault with some BPT
          await setAccountBalance({
            account: vaultProxy,
            amount: (await getAssetUnit(bpt)).mul(10),
            provider,
            token: bpt,
          });
        });

        it('does not allow receiving unexpected incoming assets', async () => {
          // Use an option to redeem for all tokens, but exclude a token from `incomingAssets`

          const redeemBptAmount = await new ITestStandardToken(bpt, provider).balanceOf(vaultProxy);

          const userData = balancerV2WeightedPoolsUserDataExactBptInForTokensOut({
            bptAmountIn: redeemBptAmount,
          });

          const request = await balancerV2ConstructRequest({
            provider,
            balancerVaultAddress,
            poolId,
            limits: [1, 1, 1], // Use >0 limits to we receive at least 1 of each token
            userData,
          });

          await expect(
            balancerV2Redeem({
              comptrollerProxy,
              integrationManager,
              fundOwner,
              balancerV2LiquidityAdapter,
              poolId,
              bptAmount: redeemBptAmount,
              incomingAssets: [weth],
              minIncomingAssetAmounts: [0],
              request,
            }),
          ).rejects.toBeRevertedWith('Unexpected asset received');
        });

        it('happy path: Weighted Pool: EXACT_BPT_IN_FOR_ONE_TOKEN_OUT', async () => {
          const incomingAsset = dai;
          const tokenIndex = poolIndexDai;

          // Get pre-redeem balances of all tokens
          const [preRedeemIncomingAssetBalance, preRedeemBptBalance] = await getAssetBalances({
            account: vaultProxy,
            assets: [incomingAsset, bpt],
          });

          // Only partially redeem BPT
          const redeemBptAmount = preRedeemBptBalance.div(5);
          expect(redeemBptAmount).not.toEqBigNumber(BigNumber.from(0));

          const userData = balancerV2WeightedPoolsUserDataExactBptInForOneTokenOut({
            bptAmountIn: redeemBptAmount,
            tokenIndex,
          });

          const request = await balancerV2ConstructRequest({
            provider,
            balancerVaultAddress,
            poolId,
            limits: [0, 0, 0],
            userData,
          });

          // Calc expected amounts of tokens to receive
          const { amountsOut_ } = await balancerHelpers.queryExit
            .args(poolId, balancerV2LiquidityAdapter, vaultProxy, request)
            .call();
          expect(amountsOut_[0]).toEqBigNumber(0); // OHM
          expect(amountsOut_[1]).toBeGtBigNumber(0); // DAI
          expect(amountsOut_[2]).toEqBigNumber(0); // WETH

          const redeemReceipt = await balancerV2Redeem({
            comptrollerProxy,
            integrationManager,
            fundOwner,
            balancerV2LiquidityAdapter,
            poolId,
            bptAmount: redeemBptAmount,
            incomingAssets: [incomingAsset],
            minIncomingAssetAmounts: [0],
            request,
          });

          // Get post-redeem balances of all tokens
          const [postRedeemIncomingAssetBalance, postRedeemBptBalance] = await getAssetBalances({
            account: vaultProxy,
            assets: [incomingAsset, bpt],
          });

          // Assert the exact amounts of tokens expected
          expect(postRedeemBptBalance).toEqBigNumber(preRedeemBptBalance.sub(redeemBptAmount));
          expect(postRedeemIncomingAssetBalance).toEqBigNumber(preRedeemIncomingAssetBalance.add(amountsOut_[1]));

          expect(redeemReceipt).toMatchInlineGasSnapshot('413752');
        });

        // Use an option that only partially spends outgoing tokens to confirm no tokens are stuck in adapter
        it('happy path: Weighted Pool: BPT_IN_FOR_EXACT_TOKENS_OUT', async () => {
          const initialBptBalance = await bpt.balanceOf(vaultProxy);

          // Partially redeem
          const maxRedeemBptAmount = initialBptBalance.div(5);
          expect(maxRedeemBptAmount).not.toEqBigNumber(BigNumber.from(0));

          // Use an arbitrary small amount of each pool token
          const incomingAssetAmounts = await Promise.all(
            poolAssets.map(async (asset) => (await getAssetUnit(asset)).div(100)),
          );

          const userData = balancerV2WeightedPoolsUserDataBptInForExactTokensOut({
            amountsOut: incomingAssetAmounts,
            maxBPTAmountIn: maxRedeemBptAmount,
          });

          const request = await balancerV2ConstructRequest({
            provider,
            balancerVaultAddress,
            poolId,
            limits: incomingAssetAmounts,
            userData,
          });

          // Calc expected amount of bpt to spend.
          const { bptIn_ } = await balancerHelpers.queryExit
            .args(poolId, balancerV2LiquidityAdapter, vaultProxy, request)
            .call();
          expect(bptIn_).toBeGtBigNumber(0);

          // Get pre-redeem balances of all tokens
          const preTxPoolAssetBalances = await getAssetBalances({
            account: vaultProxy,
            assets: poolAssets,
          });

          await balancerV2Redeem({
            comptrollerProxy,
            integrationManager,
            fundOwner,
            balancerV2LiquidityAdapter,
            poolId,
            bptAmount: maxRedeemBptAmount,
            incomingAssets: poolAssets,
            minIncomingAssetAmounts: incomingAssetAmounts,
            request,
          });

          // Get post-redeem balances of all tokens
          const postTxPoolAssetBalances = await getAssetBalances({
            account: vaultProxy,
            assets: poolAssets,
          });

          // Assert the exact amounts of tokens expected
          for (const i in poolAssets) {
            expect(postTxPoolAssetBalances[i]).toEqBigNumber(preTxPoolAssetBalances[i].add(incomingAssetAmounts[i]));
          }

          // The bpt balance should only have decreased by the exact amount of bpt actually redeemed
          expect(await bpt.balanceOf(vaultProxy)).toEqBigNumber(initialBptBalance.sub(bptIn_));
        });
      });
    });
  });
});
