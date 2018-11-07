import * as R from 'ramda';
import * as Eth from 'web3-eth';
import { Address } from '~/utils/types';
import { getGlobalEnvironment, Environment } from '~/utils/environment';

export type GetContractWithPathFunction = (
  relativePath: string,
  address: Address,
  environment?: Environment,
) => typeof Eth.Contract;

export const getContractWithPath: GetContractWithPathFunction = R.memoizeWith(
  // TODO: Make this work with separate environments
  (relativePath, address, environment) => `${relativePath}${address}`,
  (
    relativePath: string,
    address: Address,
    environment = getGlobalEnvironment(),
  ) => {
    const abi = require(`~/../out/${relativePath}.abi.json`);
    const contract = new environment.eth.Contract(abi, address.toString());
    return contract;
  },
);
