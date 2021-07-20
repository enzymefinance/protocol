import { SignerWithAddress } from '@enzymefinance/hardhat';
import { FeeHook, feeManagerConfigArgs, FeeSettlementType, IFee } from '@enzymefinance/protocol';
import { constants, utils } from 'ethers';

export async function generateFeeManagerConfigWithMockFees({ deployer }: { deployer: SignerWithAddress }) {
  const fees = await generateMockFees({
    deployer,
  });

  const feeManagerSettingsData = [utils.randomBytes(10), '0x', utils.randomBytes(2)];

  return feeManagerConfigArgs({
    fees: Object.values(fees),
    settings: feeManagerSettingsData,
  });
}

export async function generateMockFees({ deployer }: { deployer: SignerWithAddress }) {
  // Create mock fees
  const mockContinuousFeeSettleOnly = await IFee.mock(deployer);
  const mockContinuousFeeWithGavAndUpdates = await IFee.mock(deployer);
  const mockPostBuySharesFee = await IFee.mock(deployer);

  // Initialize mock fee return values
  await Promise.all([
    // Continuous fee the mimics ManagementFee
    mockContinuousFeeSettleOnly.getRecipientForFund.returns(constants.AddressZero),
    mockContinuousFeeSettleOnly.settle.returns(FeeSettlementType.None, constants.AddressZero, 0),
    mockContinuousFeeSettleOnly.payout.returns(false),
    mockContinuousFeeSettleOnly.addFundSettings.returns(undefined),
    mockContinuousFeeSettleOnly.activateForFund.returns(undefined),
    mockContinuousFeeSettleOnly.update.returns(undefined),
    mockContinuousFeeSettleOnly.settlesOnHook.returns(false, false),
    mockContinuousFeeSettleOnly.settlesOnHook.given(FeeHook.Continuous).returns(true, false),
    mockContinuousFeeSettleOnly.settlesOnHook.given(FeeHook.PreBuyShares).returns(true, false),
    mockContinuousFeeSettleOnly.settlesOnHook.given(FeeHook.PreRedeemShares).returns(true, false),
    mockContinuousFeeSettleOnly.updatesOnHook.returns(false, false),
    // Continuous fee the mimics PerformanceFee
    mockContinuousFeeWithGavAndUpdates.getRecipientForFund.returns(constants.AddressZero),
    mockContinuousFeeWithGavAndUpdates.settle.returns(FeeSettlementType.None, constants.AddressZero, 0),
    mockContinuousFeeWithGavAndUpdates.payout.returns(false),
    mockContinuousFeeWithGavAndUpdates.addFundSettings.returns(undefined),
    mockContinuousFeeWithGavAndUpdates.activateForFund.returns(undefined),
    mockContinuousFeeWithGavAndUpdates.update.returns(undefined),
    mockContinuousFeeWithGavAndUpdates.settlesOnHook.returns(false, false),
    mockContinuousFeeWithGavAndUpdates.settlesOnHook.given(FeeHook.Continuous).returns(true, true),
    mockContinuousFeeWithGavAndUpdates.settlesOnHook.given(FeeHook.PreBuyShares).returns(true, true),
    mockContinuousFeeWithGavAndUpdates.settlesOnHook.given(FeeHook.PreRedeemShares).returns(true, true),
    mockContinuousFeeWithGavAndUpdates.updatesOnHook.returns(false, false),
    mockContinuousFeeWithGavAndUpdates.updatesOnHook.given(FeeHook.Continuous).returns(true, true),
    mockContinuousFeeWithGavAndUpdates.updatesOnHook.given(FeeHook.PostBuyShares).returns(true, true),
    mockContinuousFeeWithGavAndUpdates.updatesOnHook.given(FeeHook.PreRedeemShares).returns(true, true),
    // PostBuyShares fee
    mockPostBuySharesFee.getRecipientForFund.returns(constants.AddressZero),
    mockPostBuySharesFee.settle.returns(FeeSettlementType.None, constants.AddressZero, 0),
    mockPostBuySharesFee.payout.returns(false),
    mockPostBuySharesFee.addFundSettings.returns(undefined),
    mockPostBuySharesFee.activateForFund.returns(undefined),
    mockPostBuySharesFee.update.returns(undefined),
    mockPostBuySharesFee.settlesOnHook.returns(false, false),
    mockPostBuySharesFee.settlesOnHook.given(FeeHook.PostBuyShares).returns(true, false),
    mockPostBuySharesFee.updatesOnHook.returns(false, false),
  ]);

  return {
    mockContinuousFeeSettleOnly,
    mockContinuousFeeWithGavAndUpdates,
    mockPostBuySharesFee,
  };
}
