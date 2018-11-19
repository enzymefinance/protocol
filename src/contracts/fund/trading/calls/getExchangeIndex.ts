import { getContract } from '~/utils/solidity';
import { Contracts } from '~/Contracts';
import { ensure } from '~/utils/guards/ensure';

const getExchangeIndex = (exchangeAddress, tradingAddress, environment) => {
  const tradingContract = getContract(
    Contracts.Trading,
    tradingAddress,
    environment,
  );
  const exchanges = tradingContract.methods.exchanges().call();
  const index = exchanges.findIndex(
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
