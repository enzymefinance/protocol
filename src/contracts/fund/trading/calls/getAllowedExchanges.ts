import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math';
import { Environment } from '~/utils/environment/Environment';

const getAllowedExchanges = async (
  environment: Environment,
  tradingAddress: Address,
) => {
  const exchangeAddress = environment.deployment.exchangeConfigs;

  const tradingContract = getContract(
    environment,
    Contracts.Trading,
    tradingAddress,
  );

  const exchanges = await tradingContract.methods.getExchangeInfo().call();
  const adapters = exchanges[1].map(exchange => exchange.toLowerCase());
  const allowedExchanges = Object.entries(exchangeAddress).filter(exchange => {
    return adapters.indexOf(exchange[1].adapter.toLowerCase()) !== -1;
  });

  return allowedExchanges.map(item => item[0]);
};

export { getAllowedExchanges };
