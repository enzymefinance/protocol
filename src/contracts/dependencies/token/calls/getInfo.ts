import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';
import { Address } from '@melonproject/token-math/address';

export const getInfo = async (
  environment: Environment,
  contractAddress: Address,
) => {
  const contract = getContract(
    environment,
    Contracts.PreminedToken,
    contractAddress,
  );
  const fromDeployment: { decimals?: number; name?: string; symbol?: string } =
    (environment.deployment &&
      environment.deployment.thirdPartyContracts.tokens.find(
        t => t.address.toLowerCase() === contractAddress.toLowerCase(),
      )) ||
    {};

  try {
    const info = {
      decimals:
        fromDeployment.decimals ||
        parseInt(await contract.methods.decimals().call(), 10),
      name: fromDeployment.name || (await contract.methods.name().call()),
      symbol: fromDeployment.symbol || (await contract.methods.symbol().call()),
      totalSupply: await contract.methods.totalSupply().call(),
    };
    return info;
  } catch (error) {
    throw new Error(
      `getInfo failed for token with address: ${contractAddress}: ${
        error.message
      }`,
    );
  }
};
