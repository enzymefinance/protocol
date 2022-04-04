import type { AddressLike, Call, Contract } from '@enzymefinance/ethers';
import { contract } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, ExternalPositionManager } from '@enzymefinance/protocol';
import {
  ExternalPositionType,
  LiquityDebtPositionActionId,
  liquityDebtPositionAddCollateralArgs,
  liquityDebtPositionBorrowArgs,
  liquityDebtPositionOpenTroveArgs,
  liquityDebtPositionRemoveCollateralArgs,
  liquityDebtPositionRepayBorrowArgs,
} from '@enzymefinance/protocol';
import type { BigNumberish } from 'ethers';
import { BigNumber, utils } from 'ethers';

import { callOnExternalPosition, createExternalPosition } from './actions';

export interface ILiquityTroveManager extends Contract<ILiquityTroveManager> {
  getBorrowingFee: Call<(_LUSDDebt: BigNumberish) => BigNumberish>;
}

export const ILiquityTroveManager = contract<ILiquityTroveManager>()`
  function getBorrowingFee(uint256) external returns (uint256)
`;

export interface ILiquityHintHelper extends Contract<ILiquityHintHelper> {
  getApproxHint: Call<
    (
      _cr: BigNumberish,
      _numTrials: BigNumberish,
      _inputRandomSeed: BigNumberish,
    ) => [hintAddress_: AddressLike, diff_: BigNumberish, latestRandomSeed_: BigNumberish]
  >;
}

export const ILiquityHintHelper = contract<ILiquityHintHelper>()`
  function getApproxHint(uint256, uint256, uint256) external returns (address, uint256, uint256)
`;

export interface ILiquitySortedTroves extends Contract<ILiquitySortedTroves> {
  findInsertPosition: Call<
    (_icr: BigNumberish, _prevId: AddressLike, _nextId: AddressLike) => [prevId_: AddressLike, nextId_: AddressLike]
  >;
}

export const ILiquitySortedTroves = contract<ILiquitySortedTroves>()`
  function findInsertPosition(uint256, address, address) external view returns (address, address)
`;

export async function createLiquityDebtPosition({
  signer,
  comptrollerProxy,
  externalPositionManager,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
}) {
  return createExternalPosition({
    comptrollerProxy,
    externalPositionManager,
    externalPositionTypeId: ExternalPositionType.LiquityDebtPosition,
    signer,
  });
}

// Based on the following util function from liquity
// https://github.com/liquity/dev/blob/7e5c38eff92c7de7b366ec791fd86abc2012952c/packages/contracts/tests/simulation_helpers.py#L557
export async function liquityCalcHints({
  collateralAmount,
  lusdAmount,
  numTrials = BigNumber.from('15'),
  liquitySortedTroves,
  liquityHintHelper,
  inputRandomSeed = BigNumber.from('4'),
}: {
  collateralAmount: BigNumber;
  lusdAmount: BigNumber;
  numTrials?: BigNumber;
  liquitySortedTroves: ILiquitySortedTroves;
  liquityHintHelper: ILiquityHintHelper;
  inputRandomSeed?: BigNumber;
}) {
  const nicr = collateralAmount.mul(utils.parseEther('100')).div(lusdAmount);

  const approxHint = await liquityHintHelper.getApproxHint.args(nicr, numTrials, inputRandomSeed).call();

  const hints = await liquitySortedTroves.findInsertPosition.args(nicr, approxHint[0], approxHint[0]).call();

  return hints;
}

export async function liquityDebtPositionAddCollateral({
  comptrollerProxy,
  externalPositionManager,
  signer,
  collateralAmount,
  lowerHint,
  upperHint,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  collateralAmount: BigNumberish;
  lowerHint: AddressLike;
  upperHint: AddressLike;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = liquityDebtPositionAddCollateralArgs({
    collateralAmount,
    lowerHint,
    upperHint,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: LiquityDebtPositionActionId.AddCollateral,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function liquityDebtPositionBorrow({
  comptrollerProxy,
  externalPositionManager,
  signer,
  maxFeePercentage,
  lusdAmount,
  lowerHint,
  upperHint,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  maxFeePercentage: BigNumberish;
  lusdAmount: BigNumberish;
  lowerHint: AddressLike;
  upperHint: AddressLike;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = liquityDebtPositionBorrowArgs({
    lowerHint,
    lusdAmount,
    maxFeePercentage,
    upperHint,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: LiquityDebtPositionActionId.Borrow,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function liquityDebtPositionCloseTrove({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = '0x';

  return callOnExternalPosition({
    actionArgs,
    actionId: LiquityDebtPositionActionId.CloseTrove,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function liquityDebtPositionOpenTrove({
  comptrollerProxy,
  externalPositionManager,
  signer,
  maxFeePercentage,
  collateralAmount,
  lusdAmount,
  lowerHint,
  upperHint,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  maxFeePercentage: BigNumberish;
  collateralAmount: BigNumberish;
  lusdAmount: BigNumberish;
  lowerHint: AddressLike;
  upperHint: AddressLike;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = liquityDebtPositionOpenTroveArgs({
    collateralAmount,
    lowerHint,
    lusdAmount,
    maxFeePercentage,
    upperHint,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: LiquityDebtPositionActionId.OpenTrove,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function liquityDebtPositionRemoveCollateral({
  comptrollerProxy,
  externalPositionManager,
  signer,
  collateralAmount,
  lowerHint,
  upperHint,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  collateralAmount: BigNumberish;
  lowerHint: AddressLike;
  upperHint: AddressLike;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = liquityDebtPositionRemoveCollateralArgs({
    collateralAmount,
    lowerHint,
    upperHint,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: LiquityDebtPositionActionId.RemoveCollateral,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function liquityDebtPositionRepay({
  comptrollerProxy,
  externalPositionManager,
  signer,
  lusdAmount,
  lowerHint,
  upperHint,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  lusdAmount: BigNumberish;
  lowerHint: AddressLike;
  upperHint: AddressLike;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = liquityDebtPositionRepayBorrowArgs({
    lowerHint,
    lusdAmount,
    upperHint,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: LiquityDebtPositionActionId.Repay,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}
