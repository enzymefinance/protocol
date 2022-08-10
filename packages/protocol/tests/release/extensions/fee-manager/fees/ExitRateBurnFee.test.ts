// @file Only tests the ExitRateBurnFee functionality not covered by
// the ExitRateFeeBase tests, i.e., the use of settlement type

import type { ComptrollerLib, ExitRateBurnFee, ProtocolFeeTracker, VaultLib } from '@enzymefinance/protocol';
import {
  calcProtocolFeeSharesDue,
  exitRateBurnFeeConfigArgs,
  exitRateFeeSharesDue,
  FeeHook,
  feeManagerConfigArgs,
  FeeSettlementType,
  ITestStandardToken,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  assertEvent,
  createNewFund,
  deployProtocolFixture,
  redeemSharesForSpecificAssets,
  redeemSharesInKind,
  transactionTimestamp,
} from '@enzymefinance/testutils';
import { BigNumber, constants } from 'ethers';

const FIVE_PERCENT = BigNumber.from(500);
const TEN_PERCENT = BigNumber.from(1000);
let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('config', () => {
  it('has correct config', async () => {
    const exitRateBurnFee = fork.deployment.exitRateBurnFee;

    for (const hook of Object.values(FeeHook)) {
      expect(await exitRateBurnFee.settlesOnHook(hook)).toMatchFunctionOutput(exitRateBurnFee.settlesOnHook, {
        settles_: hook === FeeHook.PreRedeemShares,
        usesGav_: false,
      });
      expect(await exitRateBurnFee.updatesOnHook(hook)).toMatchFunctionOutput(exitRateBurnFee.updatesOnHook, {
        updates_: false,
        usesGav_: false,
      });
    }

    expect(await exitRateBurnFee.getSettlementType()).toMatchFunctionOutput(
      exitRateBurnFee.getSettlementType.fragment,
      FeeSettlementType.Burn,
    );
  });
});

describe('settle', () => {
  const inKindRate = FIVE_PERCENT;
  const specificAssetsRate = TEN_PERCENT;
  let exitRateBurnFee: ExitRateBurnFee, protocolFeeTracker: ProtocolFeeTracker;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let denominationAsset: ITestStandardToken;
  let investor: SignerWithAddress;
  let preTxInvestorSharesBalance: BigNumber, preTxSharesSupply: BigNumber, preTxProtocolFeeLastPaidTimestamp: BigNumber;

  beforeEach(async () => {
    let fundOwner: SignerWithAddress;

    [fundOwner, investor] = fork.accounts;

    exitRateBurnFee = fork.deployment.exitRateBurnFee;
    protocolFeeTracker = fork.deployment.protocolFeeTracker;

    denominationAsset = new ITestStandardToken(fork.config.primitives.usdc, provider);

    const newFundRes = await createNewFund({
      denominationAsset,
      feeManagerConfig: feeManagerConfigArgs({
        fees: [exitRateBurnFee],
        settings: [
          exitRateBurnFeeConfigArgs({
            inKindRate,
            specificAssetsRate,
          }),
        ],
      }),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      investment: {
        buyer: investor,
        provider,
        seedBuyer: true,
      },
      signer: fundOwner,
    });

    comptrollerProxy = newFundRes.comptrollerProxy;
    vaultProxy = newFundRes.vaultProxy;

    preTxInvestorSharesBalance = await vaultProxy.balanceOf(investor);
    preTxSharesSupply = await vaultProxy.totalSupply();
    preTxProtocolFeeLastPaidTimestamp = await protocolFeeTracker.getLastPaidForVault(vaultProxy);
  });

  it('happy path: specific asset redemption, partial shares', async () => {
    const sharesToRedeem = preTxInvestorSharesBalance.div(4);

    const receipt = await redeemSharesForSpecificAssets({
      comptrollerProxy,
      payoutAssetPercentages: [10000],
      payoutAssets: [denominationAsset],
      quantity: sharesToRedeem,
      signer: investor,
    });

    // Calc the expected exit fee charged
    const expectedFeeSharesDue = exitRateFeeSharesDue({
      rate: specificAssetsRate,
      sharesRedeemed: sharesToRedeem,
    });

    expect(expectedFeeSharesDue).toBeGtBigNumber(0);

    // Calc the expected protocol fee charged
    const expectedProtocolFee = await calcProtocolFeeSharesDue({
      protocolFeeTracker,
      secondsSinceLastPaid: BigNumber.from(await transactionTimestamp(receipt)).sub(preTxProtocolFeeLastPaidTimestamp),
      sharesSupply: preTxSharesSupply.sub(expectedFeeSharesDue),
      vaultProxyAddress: vaultProxy,
    });

    // Assert the fees were correctly charged and burned
    expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(preTxInvestorSharesBalance.sub(sharesToRedeem));
    expect(await vaultProxy.totalSupply()).toEqBigNumber(
      preTxSharesSupply.sub(sharesToRedeem).add(expectedProtocolFee),
    );

    // Assert the event was emitted
    assertEvent(receipt, exitRateBurnFee.abi.getEvent('Settled'), {
      comptrollerProxy,
      forSpecificAssets: true,
      payer: investor,
      sharesQuantity: expectedFeeSharesDue,
    });
  });

  it('happy path: in-kind redemption, all shares', async () => {
    const sharesToRedeem = preTxInvestorSharesBalance;

    const receipt = await redeemSharesInKind({
      comptrollerProxy,
      quantity: constants.MaxUint256,
      signer: investor,
    });

    // Calc the expected exit fee charged
    const expectedFeeSharesDue = exitRateFeeSharesDue({
      rate: inKindRate,
      sharesRedeemed: sharesToRedeem,
    });

    expect(expectedFeeSharesDue).toBeGtBigNumber(0);

    // Calc the expected protocol fee charged
    const expectedProtocolFee = await calcProtocolFeeSharesDue({
      protocolFeeTracker,
      secondsSinceLastPaid: BigNumber.from(await transactionTimestamp(receipt)).sub(preTxProtocolFeeLastPaidTimestamp),
      sharesSupply: preTxSharesSupply.sub(expectedFeeSharesDue),
      vaultProxyAddress: vaultProxy,
    });

    // Assert the fees were correctly charged and burned
    expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(0);
    expect(await vaultProxy.totalSupply()).toEqBigNumber(
      preTxSharesSupply.sub(sharesToRedeem).add(expectedProtocolFee),
    );

    // Assert the event was emitted
    assertEvent(receipt, exitRateBurnFee.abi.getEvent('Settled'), {
      comptrollerProxy,
      forSpecificAssets: false,
      payer: investor,
      sharesQuantity: expectedFeeSharesDue,
    });
  });
});
