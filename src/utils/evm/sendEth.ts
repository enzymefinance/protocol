import { Address, QuantityInterface } from '@melonproject/token-math';

import { Environment } from '../environment/Environment';
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

  const signedTx = await environment.wallet.signTransaction(tx);

  try {
    await environment.eth.sendSignedTransaction(signedTx);
  } catch (error) {
    throw new Error(`Error with sendEth ${error.message}`);
  }
};

export { sendEth };
