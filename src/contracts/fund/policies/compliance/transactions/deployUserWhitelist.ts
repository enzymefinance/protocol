import { Address } from '@melonproject/token-math';

import { Environment } from '~/utils/environment/Environment';

import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';

export const deployUserWhitelist = async (
  environment: Environment,
  preapproved: [Address],
) => {
  const preapprovedStrings = preapproved.map(p => p.toString());

  const address = await deployContract(environment, Contracts.UserWhitelist, [
    preapprovedStrings,
  ]);

  return address;
};
