import { constants, utils } from 'ethers';
import { SignerWithAddress } from '@crestproject/crestproject';
import {
  IFee,
  FeeManager,
  feeManagerConfigArgs,
  FeeSettlementType,
  FeeHook,
} from '@melonproject/protocol';

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

  const feeManagerSettingsData = [
    utils.randomBytes(10),
    '0x',
    utils.randomBytes(2),
  ];

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
  const mockContinuousFee1 = await IFee.mock(deployer);
  const mockContinuousFee2 = await IFee.mock(deployer);
  const mockPostBuySharesFee = await IFee.mock(deployer);

  // Initialize mock fee return values
  await Promise.all([
    // Continuous fee 1
    mockContinuousFee1.identifier.returns(`MOCK_CONTINUOUS_1`),
    mockContinuousFee1.settle.returns(
      FeeSettlementType.None,
      constants.AddressZero,
      0,
    ),
    mockContinuousFee1.payout.returns(false),
    mockContinuousFee1.addFundSettings.returns(undefined),
    mockContinuousFee1.activateForFund.returns(undefined),
    mockContinuousFee1.implementedHooks.returns([
      FeeHook.Continuous,
      FeeHook.PreBuyShares,
      FeeHook.PreRedeemShares,
    ]),
    // Continuous fee 2
    mockContinuousFee2.identifier.returns(`MOCK_CONTINUOUS_2`),
    mockContinuousFee2.settle.returns(
      FeeSettlementType.None,
      constants.AddressZero,
      0,
    ),
    mockContinuousFee2.payout.returns(false),
    mockContinuousFee2.addFundSettings.returns(undefined),
    mockContinuousFee2.activateForFund.returns(undefined),
    mockContinuousFee2.implementedHooks.returns([
      FeeHook.Continuous,
      FeeHook.PreBuyShares,
      FeeHook.PreRedeemShares,
    ]),
    // PostBuyShares fee
    mockPostBuySharesFee.identifier.returns(`MOCK_POST_BUY_SHARES`),
    mockPostBuySharesFee.settle.returns(
      FeeSettlementType.None,
      constants.AddressZero,
      0,
    ),
    mockPostBuySharesFee.payout.returns(false),
    mockPostBuySharesFee.addFundSettings.returns(undefined),
    mockPostBuySharesFee.activateForFund.returns(undefined),
    mockPostBuySharesFee.implementedHooks.returns([FeeHook.PostBuyShares]),
  ]);

  // Register all mock fees
  await feeManager.registerFees([
    mockContinuousFee1,
    mockContinuousFee2,
    mockPostBuySharesFee,
  ]);

  return {
    mockContinuousFee1,
    mockContinuousFee2,
    mockPostBuySharesFee,
  };
}
