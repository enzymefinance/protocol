import getGlobalEnvironment from '~/utils/environment/getGlobalEnvironment';
import getContract from '../utils/getContract';

export const getInfo = async (
  contractAddress,
  environment = getGlobalEnvironment(),
) => {
  const contract = getTokenContract(contractAddress, environment);
  const symbol = await contract.methods.symbol().call();
  const name = await contract.methods.name().call();
  const decimals = parseInt(await contract.methods.decimals().call(), 10);
  const totalSupply = parseInt(await contract.methods.totalSupply().call(), 10);

  return {
    symbol,
    name,
    decimals,
    totalSupply,
  };
};
