import { Quantity, IQuantity, Token } from '@melonproject/token-math';
import { Address } from '~/utils/types';
import {
  prepareTransaction,
  sendTransaction,
  getContract,
  Contract,
} from '~/utils/solidity';
import { getToken } from '~/contracts/dependencies/token';
import { isAddress } from '~/utils/checks';
import { ensure } from '~/utils/guards';

const guards = async (
  engineAddress: Address,
  quantity: IQuantity,
  environment,
) => {
  const engine = getContract(Contract.Engine, engineAddress);
  const mlnAddress = await engine.methods.mlnToken().call();
  const mlnTokenContract = getContract(Contract.StandardToken, mlnAddress);
  const mlnToken = await getToken(mlnAddress);
  ensure(
    Token.isSameToken(quantity, mlnToken),
    'It is only possible to burn MLN',
  );
  const allowedMln = Quantity.createQuantity(
    mlnToken,
    await mlnTokenContract.methods
      .allowance(environment.wallet.address, engineAddress.toString())
      .call(),
  );
  ensure(
    Quantity.isEqual(allowedMln, quantity) ||
      Quantity.greaterThan(allowedMln, quantity),
    `Amount must be approved prior to calling this function.`,
  );
};

const prepare = async (
  engineAddress: Address,
  quantity: IQuantity,
  environment,
) => {
  const contract = getContract(Contract.Engine, engineAddress);
  const transaction = contract.methods.sellAndBurnMln(quantity);
  transaction.name = 'sellAndBurnMln';
  const prepared = await prepareTransaction(transaction, environment);
  return prepared;
};

const validateReceipt = receipt => {
  return true;
};

export const sellAndBurnMln = async (
  engineAddress: Address,
  quantity: IQuantity,
  environment?,
) => {
  await guards(engineAddress, quantity, environment);
  const transaction = await prepare(engineAddress, quantity, environment);
  const receipt = await sendTransaction(transaction, environment);
  const result = validateReceipt(receipt);
  return result;
};
