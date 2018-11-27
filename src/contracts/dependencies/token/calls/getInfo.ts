import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

export const getInfo = async (
  contractAddress,
  environment = getGlobalEnvironment(),
) => {
  const contract = getContract(
    Contracts.PreminedToken,
    contractAddress,
    environment,
  );
  const symbol = await contract.methods.symbol().call();
  const name = await contract.methods.name().call();
  const decimals = parseInt(await contract.methods.decimals().call(), 10);
  const totalSupply = parseInt(await contract.methods.totalSupply().call(), 10);

  return {
    decimals,
    name,
    symbol,
    totalSupply,
  };
};
