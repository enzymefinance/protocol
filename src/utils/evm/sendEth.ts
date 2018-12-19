import { Environment } from '../environment/Environment';
import { Address } from '@melonproject/token-math/address';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { getWeb3Options } from '../environment/getWeb3Options';

interface SendEthArgs {
  to: Address;
  howMuch: QuantityInterface;
}

const sendEth = async (
  environment: Environment,
  { to, howMuch }: SendEthArgs,
): Promise<void> => {
  const options = getWeb3Options(environment);

  const tx = {
    ...options,
    to: to.toString(),
    value: howMuch.quantity.toString(),
  };

  const signedTx = await environment.wallet.sign(tx);

  await environment.eth.sendSignedTransaction(signedTx);
};

export { sendEth };
