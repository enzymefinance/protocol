import * as Eth from 'web3-eth';
import { Address } from '~/utils/types';
import { getGlobalEnvironment, Environment } from '~/utils/environment';
import { requireMap, Contracts } from '~/Contracts';
import { getContractWithPath } from '.';

export type GetContractFunction = (
  relativePath: Contracts,
  address: Address,
  environment?: Environment,
) => typeof Eth.Contract;

export const getContract = (
  relativePath: Contracts,
  address: Address,
  environment = getGlobalEnvironment(),
) => getContractWithPath(relativePath, address, environment);
