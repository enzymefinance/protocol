import { getGlobalEnvironment } from '~/utils/environment';
import { Contract, getContract } from '~/utils/solidity';

export const getInfo = async (
  contractAddress,
  environment = getGlobalEnvironment(),
) => {
  const contract = getContract(
    Contract.PreminedToken,
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
