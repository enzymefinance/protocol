import { AddressLike, Call, Contract, contract, Send } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  approveAssetsSelector,
  callOnIntegrationArgs,
  claimRewardsAndReinvestSelector,
  claimRewardsAndSwapSelector,
  claimRewardsSelector,
  ComptrollerLib,
  curveAaveClaimRewardsAndReinvestArgs,
  curveAaveClaimRewardsAndSwapArgs,
  curveAaveLendAndStakeArgs,
  curveAaveLendArgs,
  CurveAavePoolAssetIndex,
  curveAaveRedeemArgs,
  curveAaveStakeArgs,
  curveAaveUnstakeAndRedeemArgs,
  curveAaveUnstakeArgs,
  curveApproveAssetsArgs,
  curveEursLendAndStakeArgs,
  curveEursLendArgs,
  curveEursRedeemArgs,
  curveEursStakeArgs,
  curveEursUnstakeAndRedeemArgs,
  curveEursUnstakeArgs,
  CurveExchangeAdapter,
  CurveLiquidityAaveAdapter,
  CurveLiquidityEursAdapter,
  CurveLiquiditySethAdapter,
  CurveLiquidityStethAdapter,
  curveSethClaimRewardsAndReinvestArgs,
  curveSethClaimRewardsAndSwapArgs,
  curveSethLendAndStakeArgs,
  curveSethLendArgs,
  curveSethRedeemArgs,
  curveSethStakeArgs,
  curveSethUnstakeAndRedeemArgs,
  curveSethUnstakeArgs,
  curveStethClaimRewardsAndReinvestArgs,
  curveStethClaimRewardsAndSwapArgs,
  curveStethLendAndStakeArgs,
  curveStethLendArgs,
  curveStethRedeemArgs,
  curveStethStakeArgs,
  curveStethUnstakeAndRedeemArgs,
  curveStethUnstakeArgs,
  curveTakeOrderArgs,
  IntegrationManager,
  IntegrationManagerActionId,
  lendAndStakeSelector,
  lendSelector,
  redeemSelector,
  stakeSelector,
  StandardToken,
  takeOrderSelector,
  unstakeAndRedeemSelector,
  unstakeSelector,
} from '@enzymefinance/protocol';
import { BigNumber, BigNumberish, constants, utils } from 'ethers';

export interface CurveLiquidityGaugeV2 extends Contract<CurveLiquidityGaugeV2> {
  claim_rewards: Send<(_addr: AddressLike) => void>;
  integrate_fraction: Call<(_for: AddressLike) => BigNumber, Contract<any>>;
}

export const CurveLiquidityGaugeV2 = contract<CurveLiquidityGaugeV2>()`
  function claim_rewards(address)
  function integrate_fraction(address) view returns (uint256)
`;

// prettier-ignore
export interface CurveSwaps extends Contract<CurveSwaps> {
  get_best_rate: Call<(_from: AddressLike, to: AddressLike, amount: BigNumberish) => { bestPool: AddressLike, amountReceived: BigNumber }, CurveSwaps>
}

export const CurveSwaps = contract<CurveSwaps>()`
  function get_best_rate(address _from, address to, uint256 amount) view returns (address bestPool, uint256 amountReceived)
`;

export interface CurveMinter extends Contract<CurveMinter> {
  mint_for: Send<(_gauge_address: AddressLike, _for: AddressLike) => void>;
}

export const CurveMinter = contract<CurveMinter>()`
  function mint_for(address,address)
`;

export async function curveApproveAssets({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  adapter,
  assets,
  amounts = new Array(assets.length).fill(constants.MaxUint256),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  adapter: AddressLike;
  assets: AddressLike[];
  amounts?: BigNumberish[];
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: adapter,
    selector: approveAssetsSelector,
    encodedCallArgs: curveApproveAssetsArgs({
      assets,
      amounts,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

// exchanges

export async function curveTakeOrder({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveExchangeAdapter,
  pool,
  outgoingAsset,
  outgoingAssetAmount = utils.parseEther('1'),
  incomingAsset,
  minIncomingAssetAmount = utils.parseEther('1'),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveExchangeAdapter: CurveExchangeAdapter;
  pool: AddressLike;
  outgoingAsset: StandardToken;
  outgoingAssetAmount?: BigNumberish;
  incomingAsset: StandardToken;
  minIncomingAssetAmount?: BigNumberish;
}) {
  const takeOrderArgs = curveTakeOrderArgs({
    pool,
    outgoingAsset: outgoingAsset,
    outgoingAssetAmount: outgoingAssetAmount,
    incomingAsset: incomingAsset,
    minIncomingAssetAmount: minIncomingAssetAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: curveExchangeAdapter,
    selector: takeOrderSelector,
    encodedCallArgs: takeOrderArgs,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

// aave pool

export function curveAaveClaimRewards({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityAaveAdapter,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityAaveAdapter: CurveLiquidityAaveAdapter;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAaveAdapter,
    selector: claimRewardsSelector,
    encodedCallArgs: constants.HashZero,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveAaveClaimRewardsAndReinvest({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityAaveAdapter,
  useFullBalances,
  minIncomingLiquidityGaugeTokenAmount = BigNumber.from(1),
  intermediaryUnderlyingAssetIndex = CurveAavePoolAssetIndex.AaveDai,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityAaveAdapter: CurveLiquidityAaveAdapter;
  useFullBalances: boolean;
  minIncomingLiquidityGaugeTokenAmount?: BigNumberish;
  intermediaryUnderlyingAssetIndex?: CurveAavePoolAssetIndex;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAaveAdapter,
    selector: claimRewardsAndReinvestSelector,
    encodedCallArgs: curveAaveClaimRewardsAndReinvestArgs({
      useFullBalances,
      minIncomingLiquidityGaugeTokenAmount,
      intermediaryUnderlyingAssetIndex,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveAaveClaimRewardsAndSwap({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityAaveAdapter,
  useFullBalances,
  incomingAsset,
  minIncomingAssetAmount = BigNumber.from(1),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityAaveAdapter: CurveLiquidityAaveAdapter;
  useFullBalances: boolean;
  incomingAsset: AddressLike;
  minIncomingAssetAmount?: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAaveAdapter,
    selector: claimRewardsAndSwapSelector,
    encodedCallArgs: curveAaveClaimRewardsAndSwapArgs({
      useFullBalances,
      incomingAsset,
      minIncomingAssetAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveAaveLend({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityAaveAdapter,
  outgoingAaveDaiAmount = BigNumber.from(0),
  outgoingAaveUsdcAmount = BigNumber.from(0),
  outgoingAaveUsdtAmount = BigNumber.from(0),
  minIncomingLPTokenAmount = BigNumber.from(1),
  useUnderlyings = false,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityAaveAdapter: CurveLiquidityAaveAdapter;
  outgoingAaveDaiAmount?: BigNumberish;
  outgoingAaveUsdcAmount?: BigNumberish;
  outgoingAaveUsdtAmount?: BigNumberish;
  minIncomingLPTokenAmount?: BigNumberish;
  useUnderlyings?: boolean;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAaveAdapter,
    selector: lendSelector,
    encodedCallArgs: curveAaveLendArgs({
      outgoingAaveDaiAmount,
      outgoingAaveUsdcAmount,
      outgoingAaveUsdtAmount,
      minIncomingLPTokenAmount,
      useUnderlyings,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveAaveLendAndStake({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityAaveAdapter,
  outgoingAaveDaiAmount = BigNumber.from(0),
  outgoingAaveUsdcAmount = BigNumber.from(0),
  outgoingAaveUsdtAmount = BigNumber.from(0),
  minIncomingLiquidityGaugeTokenAmount = BigNumber.from(1),
  useUnderlyings = false,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityAaveAdapter: CurveLiquidityAaveAdapter;
  outgoingAaveDaiAmount?: BigNumberish;
  outgoingAaveUsdcAmount?: BigNumberish;
  outgoingAaveUsdtAmount?: BigNumberish;
  minIncomingLiquidityGaugeTokenAmount?: BigNumberish;
  useUnderlyings?: boolean;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAaveAdapter,
    selector: lendAndStakeSelector,
    encodedCallArgs: curveAaveLendAndStakeArgs({
      outgoingAaveDaiAmount,
      outgoingAaveUsdcAmount,
      outgoingAaveUsdtAmount,
      minIncomingLiquidityGaugeTokenAmount,
      useUnderlyings,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveAaveRedeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityAaveAdapter,
  outgoingLPTokenAmount,
  minIncomingAaveDaiAmount = BigNumber.from(1),
  minIncomingAaveUsdcAmount = BigNumber.from(1),
  minIncomingAaveUsdtAmount = BigNumber.from(1),
  receiveSingleAsset = false,
  useUnderlyings = false,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityAaveAdapter: CurveLiquidityAaveAdapter;
  outgoingLPTokenAmount: BigNumberish;
  minIncomingAaveDaiAmount?: BigNumberish;
  minIncomingAaveUsdcAmount?: BigNumberish;
  minIncomingAaveUsdtAmount?: BigNumberish;
  receiveSingleAsset?: boolean;
  useUnderlyings?: boolean;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAaveAdapter,
    selector: redeemSelector,
    encodedCallArgs: curveAaveRedeemArgs({
      outgoingLPTokenAmount,
      minIncomingAaveDaiAmount,
      minIncomingAaveUsdcAmount,
      minIncomingAaveUsdtAmount,
      receiveSingleAsset,
      useUnderlyings,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveAaveStake({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityAaveAdapter,
  outgoingLPTokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityAaveAdapter: CurveLiquidityAaveAdapter;
  outgoingLPTokenAmount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAaveAdapter,
    selector: stakeSelector,
    encodedCallArgs: curveAaveStakeArgs({
      outgoingLPTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveAaveUnstakeAndRedeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityAaveAdapter,
  outgoingLiquidityGaugeTokenAmount,
  minIncomingAaveDaiAmount = BigNumber.from(1),
  minIncomingAaveUsdcAmount = BigNumber.from(1),
  minIncomingAaveUsdtAmount = BigNumber.from(1),
  receiveSingleAsset = false,
  useUnderlyings = false,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityAaveAdapter: CurveLiquidityAaveAdapter;
  outgoingLiquidityGaugeTokenAmount: BigNumberish;
  minIncomingAaveDaiAmount?: BigNumberish;
  minIncomingAaveUsdcAmount?: BigNumberish;
  minIncomingAaveUsdtAmount?: BigNumberish;
  receiveSingleAsset?: boolean;
  useUnderlyings?: boolean;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAaveAdapter,
    selector: unstakeAndRedeemSelector,
    encodedCallArgs: curveAaveUnstakeAndRedeemArgs({
      outgoingLiquidityGaugeTokenAmount,
      minIncomingAaveDaiAmount,
      minIncomingAaveUsdcAmount,
      minIncomingAaveUsdtAmount,
      receiveSingleAsset,
      useUnderlyings,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveAaveUnstake({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityAaveAdapter,
  outgoingLiquidityGaugeTokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityAaveAdapter: CurveLiquidityAaveAdapter;
  outgoingLiquidityGaugeTokenAmount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAaveAdapter,
    selector: unstakeSelector,
    encodedCallArgs: curveAaveUnstakeArgs({
      outgoingLiquidityGaugeTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

// eurs pool

export function curveEursClaimRewards({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityEursAdapter,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityEursAdapter: CurveLiquidityEursAdapter;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityEursAdapter,
    selector: claimRewardsSelector,
    encodedCallArgs: constants.HashZero,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveEursLend({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityEursAdapter,
  outgoingEursAmount,
  outgoingSeurAmount,
  minIncomingLPTokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityEursAdapter: CurveLiquidityEursAdapter;
  outgoingEursAmount: BigNumberish;
  outgoingSeurAmount: BigNumberish;
  minIncomingLPTokenAmount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityEursAdapter,
    selector: lendSelector,
    encodedCallArgs: curveEursLendArgs({
      outgoingEursAmount,
      outgoingSeurAmount,
      minIncomingLPTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveEursLendAndStake({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityEursAdapter,
  outgoingEursAmount,
  outgoingSeurAmount,
  minIncomingLiquidityGaugeTokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityEursAdapter: CurveLiquidityEursAdapter;
  outgoingEursAmount: BigNumberish;
  outgoingSeurAmount: BigNumberish;
  minIncomingLiquidityGaugeTokenAmount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityEursAdapter,
    selector: lendAndStakeSelector,
    encodedCallArgs: curveEursLendAndStakeArgs({
      outgoingEursAmount,
      outgoingSeurAmount,
      minIncomingLiquidityGaugeTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveEursRedeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityEursAdapter,
  outgoingLPTokenAmount,
  minIncomingEursAmount,
  minIncomingSeurAmount,
  receiveSingleAsset,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityEursAdapter: CurveLiquidityEursAdapter;
  outgoingLPTokenAmount: BigNumberish;
  minIncomingEursAmount: BigNumberish;
  minIncomingSeurAmount: BigNumberish;
  receiveSingleAsset: boolean;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityEursAdapter,
    selector: redeemSelector,
    encodedCallArgs: curveEursRedeemArgs({
      outgoingLPTokenAmount,
      minIncomingEursAmount,
      minIncomingSeurAmount,
      receiveSingleAsset,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveEursStake({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityEursAdapter,
  outgoingLPTokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityEursAdapter: CurveLiquidityEursAdapter;
  outgoingLPTokenAmount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityEursAdapter,
    selector: stakeSelector,
    encodedCallArgs: curveEursStakeArgs({
      outgoingLPTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveEursUnstakeAndRedeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityEursAdapter,
  outgoingLiquidityGaugeTokenAmount,
  minIncomingEursAmount,
  minIncomingSeurAmount,
  receiveSingleAsset,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityEursAdapter: CurveLiquidityEursAdapter;
  outgoingLiquidityGaugeTokenAmount: BigNumberish;
  minIncomingEursAmount: BigNumberish;
  minIncomingSeurAmount: BigNumberish;
  receiveSingleAsset: boolean;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityEursAdapter,
    selector: unstakeAndRedeemSelector,
    encodedCallArgs: curveEursUnstakeAndRedeemArgs({
      outgoingLiquidityGaugeTokenAmount,
      minIncomingEursAmount,
      minIncomingSeurAmount,
      receiveSingleAsset,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveEursUnstake({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityEursAdapter,
  outgoingLiquidityGaugeTokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityEursAdapter: CurveLiquidityEursAdapter;
  outgoingLiquidityGaugeTokenAmount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityEursAdapter,
    selector: unstakeSelector,
    encodedCallArgs: curveEursUnstakeArgs({
      outgoingLiquidityGaugeTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

// sETH pool

export function curveSethClaimRewards({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquiditySethAdapter,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquiditySethAdapter: CurveLiquiditySethAdapter;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquiditySethAdapter,
    selector: claimRewardsSelector,
    encodedCallArgs: constants.HashZero,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveSethClaimRewardsAndReinvest({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquiditySethAdapter,
  useFullBalances,
  minIncomingLiquidityGaugeTokenAmount = BigNumber.from(1),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquiditySethAdapter: CurveLiquiditySethAdapter;
  useFullBalances: boolean;
  minIncomingLiquidityGaugeTokenAmount?: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquiditySethAdapter,
    selector: claimRewardsAndReinvestSelector,
    encodedCallArgs: curveSethClaimRewardsAndReinvestArgs({
      useFullBalances,
      minIncomingLiquidityGaugeTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveSethClaimRewardsAndSwap({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquiditySethAdapter,
  useFullBalances,
  incomingAsset,
  minIncomingAssetAmount = BigNumber.from(1),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquiditySethAdapter: CurveLiquiditySethAdapter;
  useFullBalances: boolean;
  incomingAsset: AddressLike;
  minIncomingAssetAmount?: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquiditySethAdapter,
    selector: claimRewardsAndSwapSelector,
    encodedCallArgs: curveSethClaimRewardsAndSwapArgs({
      useFullBalances,
      incomingAsset,
      minIncomingAssetAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveSethLend({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquiditySethAdapter,
  outgoingWethAmount,
  outgoingSethAmount,
  minIncomingLPTokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquiditySethAdapter: CurveLiquiditySethAdapter;
  outgoingWethAmount: BigNumberish;
  outgoingSethAmount: BigNumberish;
  minIncomingLPTokenAmount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquiditySethAdapter,
    selector: lendSelector,
    encodedCallArgs: curveSethLendArgs({
      outgoingWethAmount,
      outgoingSethAmount,
      minIncomingLPTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveSethLendAndStake({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquiditySethAdapter,
  outgoingWethAmount,
  outgoingSethAmount,
  minIncomingLiquidityGaugeTokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquiditySethAdapter: CurveLiquiditySethAdapter;
  outgoingWethAmount: BigNumberish;
  outgoingSethAmount: BigNumberish;
  minIncomingLiquidityGaugeTokenAmount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquiditySethAdapter,
    selector: lendAndStakeSelector,
    encodedCallArgs: curveSethLendAndStakeArgs({
      outgoingWethAmount,
      outgoingSethAmount,
      minIncomingLiquidityGaugeTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveSethRedeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquiditySethAdapter,
  outgoingLPTokenAmount,
  minIncomingWethAmount,
  minIncomingSethAmount,
  receiveSingleAsset,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquiditySethAdapter: CurveLiquiditySethAdapter;
  outgoingLPTokenAmount: BigNumberish;
  minIncomingWethAmount: BigNumberish;
  minIncomingSethAmount: BigNumberish;
  receiveSingleAsset: boolean;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquiditySethAdapter,
    selector: redeemSelector,
    encodedCallArgs: curveSethRedeemArgs({
      outgoingLPTokenAmount,
      minIncomingWethAmount,
      minIncomingSethAmount,
      receiveSingleAsset,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveSethStake({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquiditySethAdapter,
  outgoingLPTokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquiditySethAdapter: CurveLiquiditySethAdapter;
  outgoingLPTokenAmount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquiditySethAdapter,
    selector: stakeSelector,
    encodedCallArgs: curveSethStakeArgs({
      outgoingLPTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveSethUnstakeAndRedeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquiditySethAdapter,
  outgoingLiquidityGaugeTokenAmount,
  minIncomingWethAmount,
  minIncomingSethAmount,
  receiveSingleAsset,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquiditySethAdapter: CurveLiquiditySethAdapter;
  outgoingLiquidityGaugeTokenAmount: BigNumberish;
  minIncomingWethAmount: BigNumberish;
  minIncomingSethAmount: BigNumberish;
  receiveSingleAsset: boolean;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquiditySethAdapter,
    selector: unstakeAndRedeemSelector,
    encodedCallArgs: curveSethUnstakeAndRedeemArgs({
      outgoingLiquidityGaugeTokenAmount,
      minIncomingWethAmount,
      minIncomingSethAmount,
      receiveSingleAsset,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveSethUnstake({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquiditySethAdapter,
  outgoingLiquidityGaugeTokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquiditySethAdapter: CurveLiquiditySethAdapter;
  outgoingLiquidityGaugeTokenAmount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquiditySethAdapter,
    selector: unstakeSelector,
    encodedCallArgs: curveSethUnstakeArgs({
      outgoingLiquidityGaugeTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

// stETH pool

export function curveStethClaimRewards({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityStethAdapter,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityStethAdapter: CurveLiquidityStethAdapter;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityStethAdapter,
    selector: claimRewardsSelector,
    encodedCallArgs: constants.HashZero,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveStethClaimRewardsAndReinvest({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityStethAdapter,
  useFullBalances,
  minIncomingLiquidityGaugeTokenAmount = BigNumber.from(1),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityStethAdapter: CurveLiquidityStethAdapter;
  useFullBalances: boolean;
  minIncomingLiquidityGaugeTokenAmount?: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityStethAdapter,
    selector: claimRewardsAndReinvestSelector,
    encodedCallArgs: curveStethClaimRewardsAndReinvestArgs({
      useFullBalances,
      minIncomingLiquidityGaugeTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveStethClaimRewardsAndSwap({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityStethAdapter,
  useFullBalances,
  incomingAsset,
  minIncomingAssetAmount = BigNumber.from(1),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityStethAdapter: CurveLiquidityStethAdapter;
  useFullBalances: boolean;
  incomingAsset: AddressLike;
  minIncomingAssetAmount?: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityStethAdapter,
    selector: claimRewardsAndSwapSelector,
    encodedCallArgs: curveStethClaimRewardsAndSwapArgs({
      useFullBalances,
      incomingAsset,
      minIncomingAssetAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveStethLend({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityStethAdapter,
  outgoingWethAmount,
  outgoingStethAmount,
  minIncomingLPTokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityStethAdapter: CurveLiquidityStethAdapter;
  outgoingWethAmount: BigNumberish;
  outgoingStethAmount: BigNumberish;
  minIncomingLPTokenAmount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityStethAdapter,
    selector: lendSelector,
    encodedCallArgs: curveStethLendArgs({
      outgoingWethAmount,
      outgoingStethAmount,
      minIncomingLPTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveStethLendAndStake({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityStethAdapter,
  outgoingWethAmount,
  outgoingStethAmount,
  minIncomingLiquidityGaugeTokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityStethAdapter: CurveLiquidityStethAdapter;
  outgoingWethAmount: BigNumberish;
  outgoingStethAmount: BigNumberish;
  minIncomingLiquidityGaugeTokenAmount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityStethAdapter,
    selector: lendAndStakeSelector,
    encodedCallArgs: curveStethLendAndStakeArgs({
      outgoingWethAmount,
      outgoingStethAmount,
      minIncomingLiquidityGaugeTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveStethRedeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityStethAdapter,
  outgoingLPTokenAmount,
  minIncomingWethAmount,
  minIncomingStethAmount,
  receiveSingleAsset,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityStethAdapter: CurveLiquidityStethAdapter;
  outgoingLPTokenAmount: BigNumberish;
  minIncomingWethAmount: BigNumberish;
  minIncomingStethAmount: BigNumberish;
  receiveSingleAsset: boolean;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityStethAdapter,
    selector: redeemSelector,
    encodedCallArgs: curveStethRedeemArgs({
      outgoingLPTokenAmount,
      minIncomingWethAmount,
      minIncomingStethAmount,
      receiveSingleAsset,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveStethStake({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityStethAdapter,
  outgoingLPTokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityStethAdapter: CurveLiquidityStethAdapter;
  outgoingLPTokenAmount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityStethAdapter,
    selector: stakeSelector,
    encodedCallArgs: curveStethStakeArgs({
      outgoingLPTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveStethUnstakeAndRedeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityStethAdapter,
  outgoingLiquidityGaugeTokenAmount,
  minIncomingWethAmount,
  minIncomingStethAmount,
  receiveSingleAsset,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityStethAdapter: CurveLiquidityStethAdapter;
  outgoingLiquidityGaugeTokenAmount: BigNumberish;
  minIncomingWethAmount: BigNumberish;
  minIncomingStethAmount: BigNumberish;
  receiveSingleAsset: boolean;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityStethAdapter,
    selector: unstakeAndRedeemSelector,
    encodedCallArgs: curveStethUnstakeAndRedeemArgs({
      outgoingLiquidityGaugeTokenAmount,
      minIncomingWethAmount,
      minIncomingStethAmount,
      receiveSingleAsset,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveStethUnstake({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityStethAdapter,
  outgoingLiquidityGaugeTokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityStethAdapter: CurveLiquidityStethAdapter;
  outgoingLiquidityGaugeTokenAmount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityStethAdapter,
    selector: unstakeSelector,
    encodedCallArgs: curveStethUnstakeArgs({
      outgoingLiquidityGaugeTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
