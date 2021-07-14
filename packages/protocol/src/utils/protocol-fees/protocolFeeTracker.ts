import { AddressLike } from '@enzymefinance/ethers';
import { BigNumber, BigNumberish } from 'ethers';
import { ProtocolFeeTracker } from '../../codegen/ProtocolFeeTracker';

export async function calcProtocolFeeSharesDue({
  protocolFeeTracker,
  vaultProxyAddress,
  sharesSupply,
  secondsSinceLastPaid,
}: {
  protocolFeeTracker: ProtocolFeeTracker;
  vaultProxyAddress: AddressLike;
  sharesSupply: BigNumberish;
  secondsSinceLastPaid: BigNumberish;
}) {
  if (BigNumber.from(sharesSupply).eq(0) || BigNumber.from(secondsSinceLastPaid).eq(0)) {
    return 0;
  }

  const secondsInYear = 31557600;
  const maxBps = 10000;

  const rawSharesDue = BigNumber.from(sharesSupply)
    .mul(await protocolFeeTracker.getFeeBpsForVault(vaultProxyAddress))
    .mul(secondsSinceLastPaid)
    .div(secondsInYear)
    .div(maxBps);

  if (rawSharesDue.eq(0)) {
    return 0;
  }

  return rawSharesDue.mul(sharesSupply).div(BigNumber.from(sharesSupply).sub(rawSharesDue));
}
