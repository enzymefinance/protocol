import * as Eth from 'web3-eth';
import * as R from 'ramda';
import { Address } from '~/utils/types';
import { getGlobalEnvironment, Environment } from '~/utils/environment';
import { requireMap, Contracts } from '~/Contracts';

export type GetContractFunction = (
  relativePath: Contracts,
  address: Address,
  environment?: Environment,
) => typeof Eth.Contract;

export const getContract: GetContractFunction = R.memoizeWith(
  // TODO: Make this work with separate environments
  (relativePath, address, environment) => `${relativePath}${address}`,
  (
    relativePath: Contracts,
    address: Address,
    environment = getGlobalEnvironment(),
  ) => {
    const abi = requireMap[relativePath];
    const contract = new environment.eth.Contract(abi, address.toString());
    return contract;
  },
);
