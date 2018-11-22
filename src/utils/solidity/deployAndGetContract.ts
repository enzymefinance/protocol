import * as Eth from 'web3-eth';
import * as R from 'ramda';
import { Address } from '~/utils/types';
import { getGlobalEnvironment, Environment } from '~/utils/environment';
import { requireMap, Contracts } from '~/Contracts';
import { deploy as deployContract, getContract } from '.';

export const deployAndGetContract = async (contract: Contracts, args = []) =>
  await getContract(contract, await deployContract(`${contract}.sol`, args));
