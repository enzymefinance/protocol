import { Address } from '@melonproject/token-math/address';
import { Environment } from '~/utils/environment';

import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployWhitelist = async (
  preapproved: [Address],
  environment?: Environment,
) => {
  const preapprovedStrings = preapproved.map(p => p.toString());

  const address = await deployContract(
    'fund/compliance/Whitelist.sol',
    [preapprovedStrings],
    environment,
  );

  return address;
};
