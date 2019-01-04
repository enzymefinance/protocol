import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { getLogCurried } from '~/utils/environment/getLogCurried';

const getLog = getLogCurried('melon:protocol:contracts:token:getInfo');

const postProcess = async (environment, totalSupply, prepared) => {
  const log = getLog(environment);

  const fromDeployment: { decimals?: number; name?: string; symbol?: string } =
    (environment.deployment &&
      environment.deployment.thirdPartyContracts.tokens.find(
        t => t.address.toLowerCase() === prepared.contractAddress.toLowerCase(),
      )) ||
    {};

  log.debug('Token info from deployment', fromDeployment);

  try {
    const contract = getContract(
      environment,
      Contracts.PreminedToken,
      prepared.contractAddress,
    );
    const info = {
      decimals:
        fromDeployment.decimals ||
        parseInt(await contract.methods.decimals().call(), 10),
      name: fromDeployment.name || (await contract.methods.name().call()),
      symbol: fromDeployment.symbol || (await contract.methods.symbol().call()),
      totalSupply,
    };
    return info;
  } catch (error) {
    throw new Error(
      `getInfo failed for token with address: ${prepared.contractAddress}: ${
        error.message
      }`,
    );
  }
};

export const getInfo = callFactoryWithoutParams(
  'totalSupply',
  Contracts.PreminedToken,
  {
    postProcess,
  },
);
