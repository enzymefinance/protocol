import { getContract } from '~/utils/solidity/getContract';
import { Contracts, Exchanges } from '~/Contracts';
import { ensure } from '~/utils/guards/ensure';
import { Address } from '@melonproject/token-math/address';
import { getDeployment } from '~/utils/solidity/getDeployment';

const getExchangeIndex = async (
  tradingAddress: Address,
  { exchange }: { exchange: Exchanges },
  environment,
) => {
  const deployment = await getDeployment();

  const exchangeAddress: Address = deployment.exchangeConfigs.find(
    o => o.name === exchange,
  ).exchangeAddress;

  const tradingContract = getContract(
    Contracts.Trading,
    tradingAddress,
    environment,
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
