import { Address } from '@melonproject/token-math/address';

import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';
import { Contracts } from '~/Contracts';

export const deploy = async (
  priceSource: Address,
  delay: number,
  mlnAddress: Address,
  environment?: Environment,
) => {
  const address = await deployContract(
    Contracts.Engine,
    [priceSource.toString(), delay, mlnAddress.toString()],
    environment,
  );

  return address;
};
