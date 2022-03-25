import type { AddressLike, Call, Contract, Send } from '@enzymefinance/ethers';
import { contract } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  ComptrollerLib,
  CurveExchangeAdapter,
  CurveLiquidityAdapter,
  CurveRedeemType,
  IntegrationManager,
  StandardToken,
} from '@enzymefinance/protocol';
import {
  callOnIntegrationArgs,
  claimRewardsSelector,
  curveClaimRewardsArgs,
  curveLendAndStakeArgs,
  curveLendArgs,
  curveRedeemArgs,
  curveStakeArgs,
  curveTakeOrderArgs,
  curveUnstakeAndRedeemArgs,
  curveUnstakeArgs,
  IntegrationManagerActionId,
  lendAndStakeSelector,
  lendSelector,
  redeemSelector,
  stakeSelector,
  takeOrderSelector,
  unstakeAndRedeemSelector,
  unstakeSelector,
} from '@enzymefinance/protocol';
import type { BigNumberish, BytesLike } from 'ethers';
import { BigNumber, utils } from 'ethers';

export interface CurveLiquidityGaugeV2 extends Contract<CurveLiquidityGaugeV2> {
  claim_rewards: Send<(_addr: AddressLike) => void>;
  integrate_fraction: Call<(_for: AddressLike) => BigNumber>;
}

export const CurveLiquidityGaugeV2 = contract<CurveLiquidityGaugeV2>()`
  function claim_rewards(address)
  function integrate_fraction(address) view returns (uint256)
`;

export interface CurveRegistry extends Contract<CurveRegistry> {
  get_coins: Call<(_pool: AddressLike) => AddressLike[]>;
  get_lp_token: Call<(_pool: AddressLike) => AddressLike>;
}

export const CurveRegistry = contract<CurveRegistry>()`
  function get_coins(address) view returns (address[8])
  function get_lp_token(address) view returns (address)
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
    incomingAsset,
    minIncomingAssetAmount,
    outgoingAsset,
    outgoingAssetAmount,
    pool,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: curveExchangeAdapter,
    encodedCallArgs: takeOrderArgs,
    selector: takeOrderSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

// combined liquidity

export function curveClaimRewards({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityAdapter,
  stakingToken,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityAdapter: CurveLiquidityAdapter;
  stakingToken: AddressLike;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAdapter,
    encodedCallArgs: curveClaimRewardsArgs({ stakingToken }),
    selector: claimRewardsSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function curveLend({
  comptrollerProxy,
  integrationManager,
  signer,
  curveLiquidityAdapter,
  pool,
  orderedOutgoingAssetAmounts,
  minIncomingLpTokenAmount = BigNumber.from(1),
  useUnderlyings,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  signer: SignerWithAddress;
  curveLiquidityAdapter: CurveLiquidityAdapter;
  pool: AddressLike;
  orderedOutgoingAssetAmounts: BigNumberish[];
  minIncomingLpTokenAmount?: BigNumberish;
  useUnderlyings: boolean;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAdapter,
    encodedCallArgs: curveLendArgs({
      minIncomingLpTokenAmount,
      orderedOutgoingAssetAmounts,
      pool,
      useUnderlyings,
    }),
    selector: lendSelector,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function curveLendAndStake({
  comptrollerProxy,
  integrationManager,
  signer,
  curveLiquidityAdapter,
  pool,
  orderedOutgoingAssetAmounts,
  incomingStakingToken,
  minIncomingStakingTokenAmount = BigNumber.from(1),
  useUnderlyings,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  signer: SignerWithAddress;
  curveLiquidityAdapter: CurveLiquidityAdapter;
  pool: AddressLike;
  orderedOutgoingAssetAmounts: BigNumberish[];
  incomingStakingToken: AddressLike;
  minIncomingStakingTokenAmount?: BigNumberish;
  useUnderlyings: boolean;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAdapter,
    encodedCallArgs: curveLendAndStakeArgs({
      incomingStakingToken,
      minIncomingStakingTokenAmount,
      orderedOutgoingAssetAmounts,
      pool,
      useUnderlyings,
    }),
    selector: lendAndStakeSelector,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function curveRedeem({
  comptrollerProxy,
  integrationManager,
  signer,
  curveLiquidityAdapter,
  pool,
  outgoingLpTokenAmount,
  useUnderlyings,
  redeemType,
  incomingAssetData,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  signer: SignerWithAddress;
  curveLiquidityAdapter: CurveLiquidityAdapter;
  pool: AddressLike;
  outgoingLpTokenAmount: BigNumberish;
  useUnderlyings: boolean;
  redeemType: CurveRedeemType;
  incomingAssetData: BytesLike;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAdapter,
    encodedCallArgs: curveRedeemArgs({
      incomingAssetData,
      outgoingLpTokenAmount,
      pool,
      redeemType,
      useUnderlyings,
    }),
    selector: redeemSelector,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function curveStake({
  comptrollerProxy,
  integrationManager,
  signer,
  curveLiquidityAdapter,
  pool,
  incomingStakingToken,
  amount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  signer: SignerWithAddress;
  curveLiquidityAdapter: CurveLiquidityAdapter;
  pool: AddressLike;
  incomingStakingToken: AddressLike;
  amount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAdapter,
    encodedCallArgs: curveStakeArgs({
      amount,
      incomingStakingToken,
      pool,
    }),
    selector: stakeSelector,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function curveUnstake({
  comptrollerProxy,
  integrationManager,
  signer,
  curveLiquidityAdapter,
  pool,
  outgoingStakingToken,
  amount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  signer: SignerWithAddress;
  curveLiquidityAdapter: CurveLiquidityAdapter;
  pool: AddressLike;
  outgoingStakingToken: AddressLike;
  amount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAdapter,
    encodedCallArgs: curveUnstakeArgs({
      amount,
      outgoingStakingToken,
      pool,
    }),
    selector: unstakeSelector,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function curveUnstakeAndRedeem({
  comptrollerProxy,
  integrationManager,
  signer,
  curveLiquidityAdapter,
  pool,
  outgoingStakingToken,
  outgoingStakingTokenAmount,
  useUnderlyings,
  redeemType,
  incomingAssetData,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  signer: SignerWithAddress;
  curveLiquidityAdapter: CurveLiquidityAdapter;
  pool: AddressLike;
  outgoingStakingToken: StandardToken;
  outgoingStakingTokenAmount: BigNumberish;
  useUnderlyings: boolean;
  redeemType: CurveRedeemType;
  incomingAssetData: BytesLike;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAdapter,
    encodedCallArgs: curveUnstakeAndRedeemArgs({
      incomingAssetData,
      outgoingStakingToken,
      outgoingStakingTokenAmount,
      pool,
      redeemType,
      useUnderlyings,
    }),
    selector: unstakeAndRedeemSelector,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
