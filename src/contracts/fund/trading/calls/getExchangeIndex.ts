import { getContract } from '~/utils/solidity/getContract';
import { Contracts, Exchanges } from '~/Contracts';
import { ensure } from '~/utils/guards/ensure';
import { Address } from '@melonproject/token-math/address';
import { getDeployment } from '~/utils/solidity/getDeployment';
import { Environment } from '~/utils/environment/Environment';

const getExchangeIndex = async (
  environment: Environment,
  tradingAddress: Address,
  { exchange }: { exchange: Exchanges },
) => {
  const deployment = await getDeployment(environment);
  const exchangeAddress: Address = deployment.exchangeConfigs.find(
    o => o.name === exchange,
  ).exchangeAddress;

  const tradingContract = getContract(
    environment,
    Contracts.Trading,
    tradingAddress,
  );
  const exchanges = await tradingContract.methods.getExchangeInfo().call();
  const index = exchanges[0].findIndex(
    e => e.toLowerCase() === exchangeAddress.toLowerCase(),
  );
  ensure(
    index !== -1,
    `Fund with address ${
      Contracts.Hub
    } does not authorize exchange with address ${exchangeAddress}`,
  );

  return index;
};

export { getExchangeIndex };
