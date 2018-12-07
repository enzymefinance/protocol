import { deploy as deployContract } from './deploy';
import { getContract } from './getContract';
import { Contracts } from '~/Contracts';

export const deployAndGetContract = async (contract: Contracts, args = []) =>
  await getContract(contract, await deployContract(contract, args));
