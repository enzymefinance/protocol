import { Environment } from '../environment/Environment';
import { QuantityInterface, createQuantity } from '@melonproject/token-math';

const getBalance = async (
  environment: Environment,
  address = environment.wallet.address,
): Promise<QuantityInterface> => {
  const balance = await environment.eth.getBalance(address.toString());
  const quantity = createQuantity('ETH', balance);
  return quantity;
};

export { getBalance };
