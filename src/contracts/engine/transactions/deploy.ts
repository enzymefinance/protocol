import { Environment } from '~/utils/environment/Environment';
import { Address } from '~/utils/types';
import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deploy = async (
  version: Address,
  priceSource: Address,
  delay: number,
  mlnAddress: Address,
  environment?: Environment,
) => {
  const address = await deployContract(
    'engine/Engine.sol',
    [version.toString(), priceSource.toString(), delay, mlnAddress.toString()],
    environment,
  );

  return address;
};
