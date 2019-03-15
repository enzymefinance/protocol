import { Address } from '@melonproject/token-math';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';
import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';
import * as web3Utils from 'web3-utils';

export const getVersionName = async (
  environment: Environment,
  hubAddress: Address,
) => {
  const { versionAddress, registryAddress } = await getRoutes(
    environment,
    hubAddress,
  );
  const registryContract = await getContract(
    environment,
    Contracts.Registry,
    registryAddress,
  );
  const versionInformation = await registryContract.methods
    .versionInformation(versionAddress.toString())
    .call();
  return web3Utils.toUtf8(versionInformation.name);
};
