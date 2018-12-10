import { Address } from '@melonproject/token-math/address';

import { Environment } from '~/utils/environment/Environment';

import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployWhitelist = async (
  environment: Environment,
  preapproved: [Address],
) => {
  const preapprovedStrings = preapproved.map(p => p.toString());

  const address = await deployContract(
    environment,
    'fund/policies/compliance/Whitelist.sol',
    [preapprovedStrings],
  );

  return address;
};
