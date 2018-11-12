import { Address } from '~/utils/types';
import { getContractWithPath, deploy } from '.';

export const deployAndGetContract = async (
  pathToSolidityFile: string,
  args = [],
  environment?,
) => {
  const address: Address = await deploy(pathToSolidityFile, args, environment);
  return getContractWithPath(pathToSolidityFile, address);
};
