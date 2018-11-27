import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { ensure } from '~/utils/guards/ensure';

const getExchangeIndex = async (
  exchangeAddress,
  tradingAddress,
  environment,
) => {
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
