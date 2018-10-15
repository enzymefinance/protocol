import Environment from '~/utils/environment/Environment';
import { Address } from '~/utils/types';

import { default as deployContract } from '~/utils/solidity/deploy';

const deployWhitelist = async (
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

export default deployWhitelist;
