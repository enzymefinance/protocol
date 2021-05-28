import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish } from 'ethers';
import { encodeArgs } from '../encoding';

export function yearnVaultV2LendArgs({
  yVault,
  outgoingUnderlyingAmount,
  minIncomingYVaultSharesAmount,
}: {
  yVault: AddressLike;
  outgoingUnderlyingAmount: BigNumberish;
  minIncomingYVaultSharesAmount: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'uint256', 'uint256'],
    [yVault, outgoingUnderlyingAmount, minIncomingYVaultSharesAmount],
  );
}

export function yearnVaultV2RedeemArgs({
  yVault,
  maxOutgoingYVaultSharesAmount,
  minIncomingUnderlyingAmount,
  slippageToleranceBps,
}: {
  yVault: AddressLike;
  maxOutgoingYVaultSharesAmount: BigNumberish;
  minIncomingUnderlyingAmount: BigNumberish;
  slippageToleranceBps: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'uint256', 'uint256', 'uint256'],
    [yVault, maxOutgoingYVaultSharesAmount, minIncomingUnderlyingAmount, slippageToleranceBps],
  );
}
