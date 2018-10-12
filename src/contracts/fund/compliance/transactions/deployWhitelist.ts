import Environment from '~/utils/environment/Environment';

import { default as deployContract } from '~/utils/solidity/deploy';

const deployWhitelist = async (
  preapproved: [string],
  environment?: Environment,
) => {
  const address = await deployContract(
    'fund/compliance/WhiteList.sol',
    [preapproved],
    environment,
  );

  return address;
};

export default deployWhitelist;
