import { sameAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  ComptrollerLib,
  CurveLiquidityAdapter,
  IntegrationManager,
  ValueInterpreter,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  ChainlinkRateAsset,
  curveIncomingAssetsDataRedeemOneCoinArgs,
  curveIncomingAssetsDataRedeemStandardArgs,
  CurveRedeemType,
  ETH_ADDRESS,
  ICurveLiquidityPool,
  StandardToken,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  createNewFund,
  curveClaimRewards,
  curveLend,
  curveRedeem,
  CurveRegistry,
  curveStake,
  curveUnstake,
  deployProtocolFixture,
  getAssetUnit,
} from '@enzymefinance/testutils';
import type { BigNumber } from 'ethers';
import { constants } from 'ethers';

// When adding a new pool to this test suite, update both `poolInfo` and `poolKeys`

let fork: ProtocolDeployment;
let curveLiquidityAdapter: CurveLiquidityAdapter;
let curveRegistry: CurveRegistry;
let poolInfo: Record<
  string,
  {
    poolAddress: string;
    gaugeTokenAddress: string | null;
    assetToLendAddress: string;
    assetToLendWhale: SignerWithAddress;
    supportsOneCoinRedeem: boolean;
    hasReentrantVirtualPrice: boolean;
  }
>;

beforeAll(async () => {
  fork = await deployProtocolFixture();
  curveLiquidityAdapter = fork.deployment.curveLiquidityAdapter;
  curveRegistry = new CurveRegistry('0x90e00ace148ca3b23ac1bc8c240c2a7dd9c2d7f5', provider);

  poolInfo = {
    // old pool, pre-templates
    '3pool': {
      assetToLendAddress: fork.config.primitives.dai,
      assetToLendWhale: whales.dai,
      gaugeTokenAddress: null,
      hasReentrantVirtualPrice: fork.config.curve.pools['3pool'].hasReentrantVirtualPrice,
      poolAddress: fork.config.curve.pools['3pool'].pool,
      supportsOneCoinRedeem: true,
    },
    aave: {
      assetToLendAddress: fork.config.aave.atokens.ausdc[0],
      assetToLendWhale: whales.ausdc,
      gaugeTokenAddress: fork.config.curve.pools.aave.liquidityGaugeToken,
      hasReentrantVirtualPrice: fork.config.curve.pools.aave.hasReentrantVirtualPrice,
      poolAddress: fork.config.curve.pools.aave.pool,
      supportsOneCoinRedeem: true,
    },
    // metapool (from metapool factory registry)
    // MIM-UST
    mim: {
      assetToLendAddress: fork.config.primitives.ust,
      assetToLendWhale: whales.ust,
      gaugeTokenAddress: fork.config.curve.pools.mim.liquidityGaugeToken,
      hasReentrantVirtualPrice: fork.config.curve.pools.mim.hasReentrantVirtualPrice,
      poolAddress: fork.config.curve.pools.mim.pool,
      supportsOneCoinRedeem: true,
    },
    seth: {
      assetToLendAddress: fork.config.weth,
      assetToLendWhale: whales.weth,
      gaugeTokenAddress: fork.config.curve.pools.seth.liquidityGaugeToken,
      hasReentrantVirtualPrice: fork.config.curve.pools.seth.hasReentrantVirtualPrice,
      poolAddress: fork.config.curve.pools.seth.pool,
      supportsOneCoinRedeem: true,
    },
    steth: {
      assetToLendAddress: fork.config.weth,
      assetToLendWhale: whales.weth,
      gaugeTokenAddress: fork.config.curve.pools.steth.liquidityGaugeToken,
      hasReentrantVirtualPrice: fork.config.curve.pools.steth.hasReentrantVirtualPrice,
      poolAddress: fork.config.curve.pools.steth.pool,
      supportsOneCoinRedeem: true,
    },
    // coins(int128) signature, no one-coin-redeem
    usdt: {
      assetToLendAddress: fork.config.primitives.usdt,
      assetToLendWhale: whales.usdt,
      gaugeTokenAddress: null,
      hasReentrantVirtualPrice: fork.config.curve.pools.usdt.hasReentrantVirtualPrice,
      poolAddress: fork.config.curve.pools.usdt.pool,
      supportsOneCoinRedeem: false,
    },
    // metapool (from main registry)
    ust: {
      assetToLendAddress: fork.config.primitives.ust,
      assetToLendWhale: whales.ust,
      gaugeTokenAddress: fork.config.curve.pools.ust.liquidityGaugeToken,
      hasReentrantVirtualPrice: fork.config.curve.pools.ust.hasReentrantVirtualPrice,
      poolAddress: fork.config.curve.pools.ust.pool,
      supportsOneCoinRedeem: true,
    },
  };
});

const poolKeys = ['3pool', 'aave', 'mim', 'seth', 'steth', 'usdt', 'ust'];

describe.each(poolKeys)('Walkthrough for %s as pool', (poolKey) => {
  let integrationManager: IntegrationManager;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let fundOwner: SignerWithAddress;
  let nTokens: number, lpToken: StandardToken, pool: ICurveLiquidityPool;
  let assetToLend: StandardToken, assetToLendIndex: number, assetToLendAmount: BigNumber;
  let valueInterpreter: ValueInterpreter;

  beforeAll(async () => {
    integrationManager = fork.deployment.integrationManager;
    valueInterpreter = fork.deployment.valueInterpreter;

    assetToLend = new StandardToken(poolInfo[poolKey].assetToLendAddress, poolInfo[poolKey].assetToLendWhale);
    assetToLendAmount = await getAssetUnit(assetToLend);

    // Parse pool info
    pool = new ICurveLiquidityPool(poolInfo[poolKey].poolAddress, provider);

    // If pool is not on the main registry, assume it is a new metapool factory,
    // in which case poolAddress === lpTokenAddress
    let lpTokenAddress = await curveRegistry.get_lp_token(pool);

    if (lpTokenAddress === constants.AddressZero) {
      lpTokenAddress = pool;
    }

    lpToken = new StandardToken(lpTokenAddress, provider);

    nTokens = 0;
    const poolTokens = [] as string[];

    // Try to get up to 8 assets, the most technically allowed
    for (let i = 0; i < 8; i++) {
      let asset: string;

      // Some pools have different index types for coin lookups.
      // Neither call succeeding should mean the index is out-of-bounds.
      try {
        asset = await pool['coins(uint256)'](i);
      } catch (e) {
        try {
          asset = await pool['coins(int128)'](i);
        } catch (e) {
          break;
        }
      }

      if (asset === constants.AddressZero) {
        break;
      }

      poolTokens.push(asset);

      if (sameAddress(asset, ETH_ADDRESS)) {
        asset = fork.config.weth;
      }

      if (sameAddress(asset, assetToLend)) {
        assetToLendIndex = i;
      }

      nTokens++;
    }

    // Add all pool assets to the asset universe with arbitrary price feeds as-needed
    const primitivesToAdd = [];

    for (const tokenAddress of poolTokens) {
      if (tokenAddress === constants.AddressZero) {
        break;
      }

      if (tokenAddress !== ETH_ADDRESS && !(await valueInterpreter.isSupportedAsset(tokenAddress))) {
        primitivesToAdd.push(tokenAddress);
      }
    }

    if (primitivesToAdd.length > 0) {
      await valueInterpreter.addPrimitives(
        primitivesToAdd,
        new Array(primitivesToAdd.length).fill(fork.config.chainlink.aggregators.usdc[0]),
        new Array(primitivesToAdd.length).fill(ChainlinkRateAsset.ETH),
      );
    }

    // Add the lpToken to the asset universe as-needed
    const curvePriceFeed = fork.deployment.curvePriceFeed;

    if (!(await valueInterpreter.isSupportedDerivativeAsset(lpToken))) {
      if (!(await curvePriceFeed.isSupportedAsset(lpToken))) {
        await curvePriceFeed.addPools(
          [pool],
          [assetToLend],
          [poolInfo[poolKey].hasReentrantVirtualPrice],
          [lpToken],
          [constants.AddressZero],
        );
      }

      await valueInterpreter.addDerivatives([lpToken], [curvePriceFeed]);
    }

    // Add the gauge token to the asset universe as-needed
    const gaugeTokenAddress = poolInfo[poolKey].gaugeTokenAddress;

    if (gaugeTokenAddress && !(await valueInterpreter.isSupportedDerivativeAsset(gaugeTokenAddress))) {
      if (!(await curvePriceFeed.isSupportedAsset(gaugeTokenAddress))) {
        await curvePriceFeed.addGaugeTokens([gaugeTokenAddress], [pool]);
      }

      await valueInterpreter.addDerivatives([gaugeTokenAddress], [curvePriceFeed]);
    }

    // Deploy fund
    [fundOwner] = fork.accounts;
    const newFundRes = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    comptrollerProxy = newFundRes.comptrollerProxy;
    vaultProxy = newFundRes.vaultProxy;

    await assetToLend.transfer(vaultProxy, assetToLendAmount);
  });

  it('can lend', async () => {
    const orderedOutgoingAssetAmounts = new Array(nTokens).fill(0);

    orderedOutgoingAssetAmounts[assetToLendIndex] = assetToLendAmount;

    await curveLend({
      comptrollerProxy,
      curveLiquidityAdapter,
      integrationManager,
      orderedOutgoingAssetAmounts,
      pool,
      signer: fundOwner,
      useUnderlyings: false,
    });
  });

  it('can redeem (standard)', async () => {
    const preTxLpTokenBalance = await lpToken.balanceOf(vaultProxy);
    const redeemAmount = preTxLpTokenBalance.div(4);

    expect(redeemAmount).toBeGtBigNumber(0);

    await curveRedeem({
      comptrollerProxy,
      curveLiquidityAdapter,
      incomingAssetData: curveIncomingAssetsDataRedeemStandardArgs({
        orderedMinIncomingAssetAmounts: new Array(nTokens).fill(0),
      }),
      integrationManager,
      outgoingLpTokenAmount: redeemAmount,
      pool,
      redeemType: CurveRedeemType.Standard,
      signer: fundOwner,
      useUnderlyings: false,
    });

    expect(await lpToken.balanceOf(vaultProxy)).toEqBigNumber(preTxLpTokenBalance.sub(redeemAmount));
  });

  it('can redeem (one-coin)', async () => {
    if (poolInfo[poolKey].supportsOneCoinRedeem) {
      const preTxLpTokenBalance = await lpToken.balanceOf(vaultProxy);
      const redeemAmount = preTxLpTokenBalance.div(4);

      expect(redeemAmount).toBeGtBigNumber(0);

      await curveRedeem({
        comptrollerProxy,
        curveLiquidityAdapter,
        incomingAssetData: curveIncomingAssetsDataRedeemOneCoinArgs({
          incomingAssetPoolIndex: assetToLendIndex,
          minIncomingAssetAmount: 0,
        }),
        integrationManager,
        outgoingLpTokenAmount: redeemAmount,
        pool,
        redeemType: CurveRedeemType.OneCoin,
        signer: fundOwner,
        useUnderlyings: false,
      });

      expect(await lpToken.balanceOf(vaultProxy)).toEqBigNumber(preTxLpTokenBalance.sub(redeemAmount));
    }
  });

  it('can stake (if gauge token given)', async () => {
    const gaugeTokenAddress = poolInfo[poolKey].gaugeTokenAddress;

    if (gaugeTokenAddress) {
      const preTxLpTokenBalance = await lpToken.balanceOf(vaultProxy);
      const stakeAmount = preTxLpTokenBalance.div(4);

      expect(stakeAmount).toBeGtBigNumber(0);

      await curveStake({
        amount: stakeAmount,
        comptrollerProxy,
        curveLiquidityAdapter,
        incomingStakingToken: gaugeTokenAddress,
        integrationManager,
        pool,
        signer: fundOwner,
      });

      expect(await lpToken.balanceOf(vaultProxy)).toEqBigNumber(preTxLpTokenBalance.sub(stakeAmount));
    }
  });

  it('can unstake (if gauge token given)', async () => {
    const gaugeTokenAddress = poolInfo[poolKey].gaugeTokenAddress;

    if (gaugeTokenAddress) {
      const preTxLpTokenBalance = await lpToken.balanceOf(vaultProxy);
      const unstakeAmount = 123;

      await curveUnstake({
        amount: unstakeAmount,
        comptrollerProxy,
        curveLiquidityAdapter,
        integrationManager,
        outgoingStakingToken: gaugeTokenAddress,
        pool,
        signer: fundOwner,
      });

      expect(await lpToken.balanceOf(vaultProxy)).toEqBigNumber(preTxLpTokenBalance.add(unstakeAmount));
    }
  });

  // TODO: for now, just tests that claim function can be called, but could also test expected tokens received
  it('can claim rewards (if gauge token given)', async () => {
    const gaugeTokenAddress = poolInfo[poolKey].gaugeTokenAddress;

    if (gaugeTokenAddress) {
      // Warp ahead in time to accrue significant rewards
      await provider.send('evm_increaseTime', [86400]);

      // Claim all earned rewards
      await curveClaimRewards({
        comptrollerProxy,
        curveLiquidityAdapter,
        fundOwner,
        integrationManager,
        stakingToken: gaugeTokenAddress,
      });
    }
  });
});
