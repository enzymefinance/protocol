import { AddressLike } from '@crestproject/crestproject';
import { BigNumber, BigNumberish, constants, Signer, utils } from 'ethers';
import { IFee } from '../../../../../codegen/IFee';
import { FeeManager } from '../../../../../utils/contracts';
import { encodeArgs, sighash } from '../../../common';

export enum feeHooks {
  None,
  BuyShares,
  Continuous,
}

export enum feeSettlementTypes {
  None,
  Direct,
  Mint,
  MintSharesOutstanding,
  BurnSharesOutstanding,
}

export async function generateFeeManagerConfigWithMockFees({
  deployer,
  feeManager,
}: {
  deployer: Signer;
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

  return await encodeArgs(
    ['address[]', 'bytes[]'],
    [Object.values(fees), feeManagerSettingsData],
  );
}

export async function generateRegisteredMockFees({
  deployer,
  feeManager,
}: {
  deployer: Signer;
  feeManager: FeeManager;
}) {
  // Create mock fees
  const mockContinuousFee1 = await IFee.mock(deployer);
  const mockContinuousFee2 = await IFee.mock(deployer);
  const mockBuySharesFee = await IFee.mock(deployer);

  // Initialize mock fee return values
  await Promise.all([
    mockContinuousFee1.identifier.returns(`MOCK_CONTINUOUS_1`),
    mockContinuousFee1.settle.returns(
      feeSettlementTypes.None,
      constants.AddressZero,
      0,
    ),
    mockContinuousFee1.payout.returns(false),
    mockContinuousFee1.addFundSettings.returns(undefined),
    mockContinuousFee1.activateForFund.returns(undefined),
    mockContinuousFee1.feeHook.returns(feeHooks.Continuous),
    mockContinuousFee2.identifier.returns(`MOCK_CONTINUOUS_2`),
    mockContinuousFee2.settle.returns(
      feeSettlementTypes.None,
      constants.AddressZero,
      0,
    ),
    mockContinuousFee2.payout.returns(false),
    mockContinuousFee2.addFundSettings.returns(undefined),
    mockContinuousFee2.activateForFund.returns(undefined),
    mockContinuousFee2.feeHook.returns(feeHooks.Continuous),
    mockBuySharesFee.identifier.returns(`MOCK_BUY_SHARES`),
    mockBuySharesFee.settle.returns(
      feeSettlementTypes.None,
      constants.AddressZero,
      0,
    ),
    mockBuySharesFee.payout.returns(false),
    mockBuySharesFee.addFundSettings.returns(undefined),
    mockBuySharesFee.activateForFund.returns(undefined),
    mockBuySharesFee.feeHook.returns(feeHooks.BuyShares),
  ]);

  // Register all mock fees
  await feeManager.registerFees([
    mockContinuousFee1,
    mockContinuousFee2,
    mockBuySharesFee,
  ]);

  return {
    mockContinuousFee1,
    mockContinuousFee2,
    mockBuySharesFee,
  };
}

export function settleBuySharesArgs(
  buyer: AddressLike,
  investmentAmount: BigNumberish,
  sharesBought: BigNumberish,
) {
  return encodeArgs(
    ['address', 'uint256', 'uint256'],
    [buyer, investmentAmount, sharesBought],
  );
}

export function sharesDueWithInflation({
  rawSharesDue,
  sharesSupply,
}: {
  rawSharesDue: BigNumber;
  sharesSupply: BigNumber;
}) {
  if (rawSharesDue == BigNumber.from(0) || sharesSupply == BigNumber.from(0)) {
    return 0;
  }

  return rawSharesDue.mul(sharesSupply).div(sharesSupply.sub(rawSharesDue));
}

export const settleContinuousFeesFragment = utils.FunctionFragment.fromString(
  'settleContinuousFees(address,bytes)',
);
export const settleContinuousFeesSelector = sighash(
  settleContinuousFeesFragment,
);
