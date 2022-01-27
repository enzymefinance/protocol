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
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
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
  }
>;
beforeAll(async () => {
  fork = await deployProtocolFixture();
  curveLiquidityAdapter = fork.deployment.curveLiquidityAdapter;
  curveRegistry = new CurveRegistry('0x90e00ace148ca3b23ac1bc8c240c2a7dd9c2d7f5', provider);

  poolInfo = {
    '3pool': {
      assetToLendAddress: fork.config.primitives.dai,
      assetToLendWhale: whales.dai,
      gaugeTokenAddress: null,
      poolAddress: '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7',
    },
    aave: {
      assetToLendAddress: fork.config.aave.atokens.ausdc[0],
      assetToLendWhale: whales.ausdc,
      gaugeTokenAddress: fork.config.curve.pools.aave.liquidityGaugeToken,
      poolAddress: fork.config.curve.pools.aave.pool,
    },
    seth: {
      assetToLendAddress: fork.config.weth,
      assetToLendWhale: whales.weth,
      gaugeTokenAddress: fork.config.curve.pools.seth.liquidityGaugeToken,
      poolAddress: fork.config.curve.pools.seth.pool,
    },
    steth: {
      assetToLendAddress: fork.config.weth,
      assetToLendWhale: whales.weth,
      gaugeTokenAddress: fork.config.curve.pools.steth.liquidityGaugeToken,
      poolAddress: fork.config.curve.pools.steth.pool,
    },
    // metapool
    ust: {
      assetToLendAddress: '0xa47c8bf37f92abed4a126bda807a7b7498661acd',
      // UST
      assetToLendWhale: whales.ust,

      gaugeTokenAddress: '0x3B7020743Bc2A4ca9EaF9D0722d42E20d6935855',
      poolAddress: '0x890f4e345B1dAED0367A877a1612f86A1f86985f',
    },
  };
});

const poolKeys = ['3pool', 'aave', 'seth', 'steth', 'ust'];

describe.each(poolKeys)('Walkthrough for %s as pool', (poolKey) => {
  let integrationManager: IntegrationManager;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let fundOwner: SignerWithAddress;
  let nTokens: number, lpToken: StandardToken;
  let assetToLend: StandardToken, assetToLendIndex: number, assetToLendAmount: BigNumber;
  let valueInterpreter: ValueInterpreter;
  beforeAll(async () => {
    integrationManager = fork.deployment.integrationManager;
    valueInterpreter = fork.deployment.valueInterpreter;
    lpToken = new StandardToken(await curveRegistry.get_lp_token(poolInfo[poolKey].poolAddress), provider);

    // Parse pool info
    assetToLend = new StandardToken(poolInfo[poolKey].assetToLendAddress, poolInfo[poolKey].assetToLendWhale);
    assetToLendAmount = await getAssetUnit(assetToLend);
    const poolTokens = await curveRegistry.get_coins(poolInfo[poolKey].poolAddress);
    nTokens = 0;
    for (let i = 0; i < poolTokens.length; i++) {
      let asset = poolTokens[i] as string;
      if (asset == constants.AddressZero) {
        break;
      }

      if (asset.toLowerCase() == ETH_ADDRESS.toLowerCase()) {
        asset = fork.config.weth;
      }

      if (asset.toLowerCase() == assetToLend.address.toLowerCase()) {
        assetToLendIndex = i;
      }
      nTokens++;
    }

    // Add all pool assets to the asset universe with arbitrary price feeds as-needed
    const primitivesToAdd = [];
    for (const tokenAddress of poolTokens) {
      if (tokenAddress == constants.AddressZero) {
        break;
      }

      if (tokenAddress != ETH_ADDRESS && !(await valueInterpreter.isSupportedAsset(tokenAddress))) {
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
        await curvePriceFeed.addDerivatives([lpToken], [assetToLend]);
      }
      await valueInterpreter.addDerivatives([lpToken], [curvePriceFeed]);
    }

    // Add the gauge token to the asset universe as-needed
    const gaugeTokenAddress = poolInfo[poolKey].gaugeTokenAddress;
    if (gaugeTokenAddress && !(await valueInterpreter.isSupportedDerivativeAsset(gaugeTokenAddress))) {
      if (!(await curvePriceFeed.isSupportedAsset(gaugeTokenAddress))) {
        await curvePriceFeed.addDerivatives([gaugeTokenAddress], [assetToLend]);
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
      pool: poolInfo[poolKey].poolAddress,
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
      pool: poolInfo[poolKey].poolAddress,
      redeemType: CurveRedeemType.Standard,
      signer: fundOwner,
      useUnderlyings: false,
    });

    expect(await lpToken.balanceOf(vaultProxy)).toEqBigNumber(preTxLpTokenBalance.sub(redeemAmount));
  });

  it('can redeem (one-coin)', async () => {
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
      pool: poolInfo[poolKey].poolAddress,
      redeemType: CurveRedeemType.OneCoin,
      signer: fundOwner,
      useUnderlyings: false,
    });

    expect(await lpToken.balanceOf(vaultProxy)).toEqBigNumber(preTxLpTokenBalance.sub(redeemAmount));
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
        pool: poolInfo[poolKey].poolAddress,
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
        pool: poolInfo[poolKey].poolAddress,
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
