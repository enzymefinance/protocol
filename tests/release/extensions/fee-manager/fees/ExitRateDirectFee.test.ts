// @file Only tests the ExitRateDirectFee functionality not covered by
// the ExitRateFeeBase tests, i.e., the use of settlement type

import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, ExitRateDirectFee, VaultLib } from '@enzymefinance/protocol';
import {
  exitRateDirectFeeConfigArgs,
  exitRateFeeSharesDue,
  FeeHook,
  feeManagerConfigArgs,
  FeeSettlementType,
  ITestStandardToken,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  assertEvent,
  createNewFund,
  deployProtocolFixture,
  redeemSharesForSpecificAssets,
  redeemSharesInKind,
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
    const exitRateDirectFee = fork.deployment.exitRateDirectFee;

    for (const hook of Object.values(FeeHook)) {
      expect(await exitRateDirectFee.settlesOnHook(hook)).toMatchFunctionOutput(exitRateDirectFee.settlesOnHook, {
        settles_: hook === FeeHook.PreRedeemShares,
        usesGav_: false,
      });
      expect(await exitRateDirectFee.updatesOnHook(hook)).toMatchFunctionOutput(exitRateDirectFee.updatesOnHook, {
        updates_: false,
        usesGav_: false,
      });
    }

    expect(await exitRateDirectFee.getSettlementType()).toMatchFunctionOutput(
      exitRateDirectFee.getSettlementType.fragment,
      FeeSettlementType.Direct,
    );
  });
});

// 'addFundSettings' is tested implicitly in the happy paths
describe('settle', () => {
  const inKindRate = FIVE_PERCENT;
  const specificAssetsRate = TEN_PERCENT;
  let exitRateDirectFee: ExitRateDirectFee;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let denominationAsset: ITestStandardToken;
  let investor: SignerWithAddress, feeRecipient: SignerWithAddress;
  let preTxInvestorSharesBalance: BigNumber;

  beforeEach(async () => {
    let fundOwner: SignerWithAddress;

    [fundOwner, investor, feeRecipient] = fork.accounts;

    exitRateDirectFee = fork.deployment.exitRateDirectFee;

    denominationAsset = new ITestStandardToken(fork.config.primitives.usdc, provider);

    const newFundRes = await createNewFund({
      denominationAsset,
      feeManagerConfig: feeManagerConfigArgs({
        fees: [exitRateDirectFee],
        settings: [
          exitRateDirectFeeConfigArgs({
            inKindRate,
            recipient: feeRecipient,
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

    // Assert the fees were correctly charged and transferred to fee recipient
    expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(preTxInvestorSharesBalance.sub(sharesToRedeem));
    expect(await vaultProxy.balanceOf(feeRecipient)).toEqBigNumber(expectedFeeSharesDue);

    // Assert the event was emitted
    assertEvent(receipt, exitRateDirectFee.abi.getEvent('Settled'), {
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

    // Assert the fees were correctly charged and transferred to fee recipient
    expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(0);
    expect(await vaultProxy.balanceOf(feeRecipient)).toEqBigNumber(expectedFeeSharesDue);

    // Assert the event was emitted
    assertEvent(receipt, exitRateDirectFee.abi.getEvent('Settled'), {
      comptrollerProxy,
      forSpecificAssets: false,
      payer: investor,
      sharesQuantity: expectedFeeSharesDue,
    });
  });
});
