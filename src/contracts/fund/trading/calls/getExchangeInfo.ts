import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math';
import { Environment } from '~/utils/environment/Environment';

const getExchangeInfo = async (
  environment: Environment,
  tradingAddress: Address,
) => {
  const tradingContract = getContract(
    environment,
    Contracts.Trading,
    tradingAddress,
  );

  const exchanges = await tradingContract.methods.getExchangeInfo().call();

  return exchanges;
};

export { getExchangeInfo };
