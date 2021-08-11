/*
 * @file Only tests the ExitRateBurnFee functionality not covered by
 * the ExitRateFeeBase tests, i.e., the use of settlement type
 */

import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  ExitRateBurnFee,
  FeeHook,
  FeeSettlementType,
  exitRateBurnFeeConfigArgs,
  exitRateFeeSharesDue,
  StandardToken,
  feeManagerConfigArgs,
  ComptrollerLib,
  VaultLib,
  calcProtocolFeeSharesDue,
  ProtocolFeeTracker,
} from '@enzymefinance/protocol';
import {
  assertEvent,
  createNewFund,
  deployProtocolFixture,
  ProtocolDeployment,
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
  let denominationAsset: StandardToken;
  let investor: SignerWithAddress;
  let preTxInvestorSharesBalance: BigNumber, preTxSharesSupply: BigNumber, preTxProtocolFeeLastPaidTimestamp: BigNumber;

  beforeEach(async () => {
    let fundOwner: SignerWithAddress;
    [fundOwner, investor] = fork.accounts;

    exitRateBurnFee = fork.deployment.exitRateBurnFee;
    protocolFeeTracker = fork.deployment.protocolFeeTracker;

    denominationAsset = new StandardToken(fork.config.primitives.usdc, whales.usdc);

    const newFundRes = await createNewFund({
      signer: fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset,
      fundOwner,
      feeManagerConfig: feeManagerConfigArgs({
        fees: [exitRateBurnFee],
        settings: [
          exitRateBurnFeeConfigArgs({
            inKindRate,
            specificAssetsRate,
          }),
        ],
      }),
      investment: {
        buyer: investor,
        seedBuyer: true,
      },
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
      signer: investor,
      quantity: sharesToRedeem,
      payoutAssets: [denominationAsset],
      payoutAssetPercentages: [10000],
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
      vaultProxyAddress: vaultProxy,
      sharesSupply: preTxSharesSupply.sub(expectedFeeSharesDue),
      secondsSinceLastPaid: BigNumber.from(await transactionTimestamp(receipt)).sub(preTxProtocolFeeLastPaidTimestamp),
    });

    // Assert the fees were correctly charged and burned
    expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(preTxInvestorSharesBalance.sub(sharesToRedeem));
    expect(await vaultProxy.totalSupply()).toEqBigNumber(
      preTxSharesSupply.sub(sharesToRedeem).add(expectedProtocolFee),
    );

    // Assert the event was emitted
    assertEvent(receipt, exitRateBurnFee.abi.getEvent('Settled'), {
      comptrollerProxy,
      payer: investor,
      sharesQuantity: expectedFeeSharesDue,
      forSpecificAssets: true,
    });
  });

  it('happy path: in-kind redemption, all shares', async () => {
    const sharesToRedeem = preTxInvestorSharesBalance;

    const receipt = await redeemSharesInKind({
      comptrollerProxy,
      signer: investor,
      quantity: constants.MaxUint256,
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
      vaultProxyAddress: vaultProxy,
      sharesSupply: preTxSharesSupply.sub(expectedFeeSharesDue),
      secondsSinceLastPaid: BigNumber.from(await transactionTimestamp(receipt)).sub(preTxProtocolFeeLastPaidTimestamp),
    });

    // Assert the fees were correctly charged and burned
    expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(0);
    expect(await vaultProxy.totalSupply()).toEqBigNumber(
      preTxSharesSupply.sub(sharesToRedeem).add(expectedProtocolFee),
    );

    // Assert the event was emitted
    assertEvent(receipt, exitRateBurnFee.abi.getEvent('Settled'), {
      comptrollerProxy,
      payer: investor,
      sharesQuantity: expectedFeeSharesDue,
      forSpecificAssets: false,
    });
  });
});
