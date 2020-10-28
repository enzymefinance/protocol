import { AddressLike, randomAddress } from '@crestproject/crestproject';
import { BigNumber, BigNumberish, constants, Signer, utils } from 'ethers';
import { IFee, FeeManager } from '@melonproject/protocol';
import { encodeArgs, sighash } from '../../../common';

export enum feeHooks {
  Continuous,
  PreBuyShares,
  PostBuyShares,
  PreRedeemShares,
}

export enum feeManagerActionIds {
  SettleContinuousFees,
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
  const mockPostBuySharesFee = await IFee.mock(deployer);

  // Initialize mock fee return values
  await Promise.all([
    // Continuous fee 1
    mockContinuousFee1.identifier.returns(`MOCK_CONTINUOUS_1`),
    mockContinuousFee1.settle.returns(
      feeSettlementTypes.None,
      constants.AddressZero,
      0,
    ),
    mockContinuousFee1.payout.returns(false),
    mockContinuousFee1.addFundSettings.returns(undefined),
    mockContinuousFee1.activateForFund.returns(undefined),
    mockContinuousFee1.implementedHooks.returns([
      feeHooks.Continuous,
      feeHooks.PreBuyShares,
      feeHooks.PreRedeemShares,
    ]),
    // Continuous fee 2
    mockContinuousFee2.identifier.returns(`MOCK_CONTINUOUS_2`),
    mockContinuousFee2.settle.returns(
      feeSettlementTypes.None,
      constants.AddressZero,
      0,
    ),
    mockContinuousFee2.payout.returns(false),
    mockContinuousFee2.addFundSettings.returns(undefined),
    mockContinuousFee2.activateForFund.returns(undefined),
    mockContinuousFee2.implementedHooks.returns([
      feeHooks.Continuous,
      feeHooks.PreBuyShares,
      feeHooks.PreRedeemShares,
    ]),
    // PostBuyShares fee
    mockPostBuySharesFee.identifier.returns(`MOCK_POST_BUY_SHARES`),
    mockPostBuySharesFee.settle.returns(
      feeSettlementTypes.None,
      constants.AddressZero,
      0,
    ),
    mockPostBuySharesFee.payout.returns(false),
    mockPostBuySharesFee.addFundSettings.returns(undefined),
    mockPostBuySharesFee.activateForFund.returns(undefined),
    mockPostBuySharesFee.implementedHooks.returns([feeHooks.PostBuyShares]),
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

export function settlePreBuySharesArgs({
  buyer = randomAddress(),
  investmentAmount = utils.parseEther('1'),
  minSharesQuantity = utils.parseEther('1'),
  gav = 0,
}: {
  buyer?: AddressLike;
  investmentAmount?: BigNumberish;
  minSharesQuantity?: BigNumberish;
  gav?: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'uint256', 'uint256', 'uint256'],
    [buyer, investmentAmount, minSharesQuantity, gav],
  );
}

export function settlePostBuySharesArgs({
  buyer = randomAddress(),
  investmentAmount = utils.parseEther('1'),
  sharesBought = utils.parseEther('1'),
}: {
  buyer?: AddressLike;
  investmentAmount?: BigNumberish;
  sharesBought?: BigNumberish;
}) {
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
