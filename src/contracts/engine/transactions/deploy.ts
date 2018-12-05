import { Address } from '@melonproject/token-math/address';

import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deploy = async (
  priceSource: Address,
  delay: number,
  mlnAddress: Address,
  environment?: Environment,
) => {
  const address = await deployContract(
    'engine/Engine.sol',
    [priceSource.toString(), delay, mlnAddress.toString()],
    environment,
  );

  return address;
};
