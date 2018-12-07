import { Address } from '@melonproject/token-math/address';

import { Environment } from '~/utils/environment/Environment';

import { deploy as deployContract } from '~/utils/solidity/deploy';
import { Contracts } from '~/Contracts';

export const deployWhitelist = async (
  preapproved: [Address],
  environment?: Environment,
) => {
  const preapprovedStrings = preapproved.map(p => p.toString());

  const address = await deployContract(
    Contracts.AssetWhitelist,
    [preapprovedStrings],
    environment,
  );

  return address;
};
