import * as Eth from 'web3-eth';
import { Address } from '@melonproject/token-math/address';
import { Environment, getGlobalEnvironment } from '~/utils/environment';
import { requireMap, Contracts } from '~/Contracts';

export type GetContractFunction = (
  relativePath: Contracts,
  address: Address,
  environment?: Environment,
) => typeof Eth.Contract;

export const getContract: GetContractFunction = (
  relativePath: Contracts,
  address: Address,
  environment = getGlobalEnvironment(),
) => {
  const abi = requireMap[relativePath];
  const contract = new environment.eth.Contract(abi, address.toString());
  return contract;
};
