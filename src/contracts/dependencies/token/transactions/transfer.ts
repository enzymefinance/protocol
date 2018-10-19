import {
  getGlobalEnvironment,
  ensureAccountAddress,
} from '~/utils/environment';
import { balanceOf } from '..';
import { Contract, getContract } from '~/utils/solidity';

// import ensure from '~/utils/guards/ensure';

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
  const contract = getContract(Contract.PreminedToken, contractAddress);
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

export const transfer = async (
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
