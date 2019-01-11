import { TokenInterface, Address } from '@melonproject/token-math';
import { getInfo } from './getInfo';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';

export const getToken = async (
  environment: Environment,
  contractAddress: Address,
): Promise<TokenInterface> => {
  const contract = getContract(
    environment,
    Contracts.PreminedToken,
    contractAddress,
  );

  const info = await getInfo(environment, contractAddress);

  return {
    address: contract.options.address,
    decimals: info.decimals,
    symbol: info.symbol,
  };
};
