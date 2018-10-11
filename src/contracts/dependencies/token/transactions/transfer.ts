import getGlobalEnvironment from '~/utils/environment/getGlobalEnvironment';
import ensureAccountAddress from '~/utils/environment/ensureAccountAddress';
import getTokenContract from '../utils/getContract';
import balanceOf from '../calls/balanceOf';
import ensure from '~/utils/guards/ensure';

export const guards = async (
  contractAddress: string,
  { to, tokens },
  environment,
) => {
  ensureAccountAddress(environment);
  const currentBalance = await balanceOf(
    contractAddress,
    { address: environment.wallet.address },
    environment,
  );

  // const balanceAfter = quantity.subtract(currentBalance, )
};

export const prepare = async (contractAddress: string, { to, tokens }) => {
  const contract = getTokenContract(contractAddress);
  const transaction = contract.methods.transfer(to, tokens);
  return transaction;
};

export const send = async (transaction, environment) => {
  const receipt = await transaction.send({
    from: environment.wallet.address,
  });

  return receipt;
};

export const validateReceipt = (receipt, { to, tokens }) => {
  return true;
};

const transfer = async (
  contractAddress: string,
  { to, tokens },
  environment = getGlobalEnvironment(),
) => {
  await guards(contractAddress, { to, tokens }, environment);
  const transaction = await prepare(contractAddress, { to, tokens });
  const receipt = await send(transaction, environment);
  const result = validateReceipt(receipt, { to, tokens });
  return result;
};

export default transfer;
