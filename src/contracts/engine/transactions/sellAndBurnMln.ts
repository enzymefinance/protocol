import { BigInteger } from '@melonproject/token-math';
import { Address } from '~/utils/types';
import {
  prepareTransaction,
  sendTransaction,
  getContract,
  Contract,
} from '~/utils/solidity';
import { isAddress } from '~/utils/checks';
import { ensure } from '~/utils/guards';

const guards = async (
  engineAddress: Address,
  amount: BigInteger,
  environment,
) => {
  const engine = getContract(Contract.Engine, engineAddress);
  const mlnAddress = await engine.methods.mlnToken().call();
  const mlnToken = getContract(Contract.StandardToken, mlnAddress);
  const allowedMln = new BigInteger(
    await mlnToken.methods
      .allowance(environment.wallet.address, engineAddress.toString())
      .call(),
  );
  ensure(
    BigInteger.isEqual(allowedMln, amount),
    `Amount must be approved prior to calling this function.`,
  );
};

const prepare = async (
  engineAddress: Address,
  amount: BigInteger,
  environment,
) => {
  const contract = getContract(Contract.Engine, engineAddress);
  const transaction = contract.methods.sellAndBurnMln(amount);
  transaction.name = 'sellAndBurnMln';
  const prepared = await prepareTransaction(transaction, environment);
  return prepared;
};

const validateReceipt = receipt => {
  return true;
};

export const sellAndBurnMln = async (
  engineAddress: Address,
  amount: BigInteger,
  environment?,
) => {
  await guards(engineAddress, amount, environment);
  const transaction = await prepare(engineAddress, amount, environment);
  const receipt = await sendTransaction(transaction, environment);
  const result = validateReceipt(receipt);
  return result;
};
