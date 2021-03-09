import { SignerWithAddress } from '@enzymefinance/hardhat';
import { FeeHook, FeeManager, feeManagerConfigArgs, FeeSettlementType, IFee } from '@enzymefinance/protocol';
import { constants, utils } from 'ethers';

export async function generateFeeManagerConfigWithMockFees({
  deployer,
  feeManager,
}: {
  deployer: SignerWithAddress;
  feeManager: FeeManager;
}) {
  const fees = await generateRegisteredMockFees({
    deployer,
    feeManager,
  });

  const feeManagerSettingsData = [utils.randomBytes(10), '0x', utils.randomBytes(2)];

  return feeManagerConfigArgs({
    fees: Object.values(fees),
    settings: feeManagerSettingsData,
  });
}

export async function generateRegisteredMockFees({
  deployer,
  feeManager,
}: {
  deployer: SignerWithAddress;
  feeManager: FeeManager;
}) {
  // Create mock fees
  const mockContinuousFeeSettleOnly = await IFee.mock(deployer);
  const mockContinuousFeeWithGavAndUpdates = await IFee.mock(deployer);
  const mockPostBuySharesFee = await IFee.mock(deployer);

  // Initialize mock fee return values
  await Promise.all([
    // Continuous fee the mimics ManagementFee
    mockContinuousFeeSettleOnly.identifier.returns(`MOCK_CONTINUOUS_1`),
    mockContinuousFeeSettleOnly.settle.returns(FeeSettlementType.None, constants.AddressZero, 0),
    mockContinuousFeeSettleOnly.payout.returns(false),
    mockContinuousFeeSettleOnly.addFundSettings.returns(undefined),
    mockContinuousFeeSettleOnly.activateForFund.returns(undefined),
    mockContinuousFeeSettleOnly.update.returns(undefined),
    mockContinuousFeeSettleOnly.implementedHooks.returns(
      [FeeHook.Continuous, FeeHook.PreBuyShares, FeeHook.PreRedeemShares],
      [],
      false,
      false,
    ),
    // Continuous fee the mimics PerformanceFee
    mockContinuousFeeWithGavAndUpdates.identifier.returns(`MOCK_CONTINUOUS_2`),
    mockContinuousFeeWithGavAndUpdates.settle.returns(FeeSettlementType.None, constants.AddressZero, 0),
    mockContinuousFeeWithGavAndUpdates.payout.returns(false),
    mockContinuousFeeWithGavAndUpdates.addFundSettings.returns(undefined),
    mockContinuousFeeWithGavAndUpdates.activateForFund.returns(undefined),
    mockContinuousFeeWithGavAndUpdates.update.returns(undefined),
    mockContinuousFeeWithGavAndUpdates.implementedHooks.returns(
      [FeeHook.Continuous, FeeHook.PreBuyShares, FeeHook.PreRedeemShares],
      [FeeHook.Continuous, FeeHook.PostBuyShares, FeeHook.PreRedeemShares],
      true,
      true,
    ),
    // PostBuyShares fee
    mockPostBuySharesFee.identifier.returns(`MOCK_POST_BUY_SHARES`),
    mockPostBuySharesFee.settle.returns(FeeSettlementType.None, constants.AddressZero, 0),
    mockPostBuySharesFee.payout.returns(false),
    mockPostBuySharesFee.addFundSettings.returns(undefined),
    mockPostBuySharesFee.activateForFund.returns(undefined),
    mockPostBuySharesFee.update.returns(undefined),
    mockPostBuySharesFee.implementedHooks.returns([FeeHook.PostBuyShares], [], false, false),
  ]);

  // Register all mock fees
  await feeManager.registerFees([
    mockContinuousFeeSettleOnly,
    mockContinuousFeeWithGavAndUpdates,
    mockPostBuySharesFee,
  ]);

  return {
    mockContinuousFeeSettleOnly,
    mockContinuousFeeWithGavAndUpdates,
    mockPostBuySharesFee,
  };
}
