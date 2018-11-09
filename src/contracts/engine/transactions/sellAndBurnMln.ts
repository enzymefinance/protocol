import { isSameToken } from '@melonproject/token-math/token';
import {
  QuantityInterface,
  createQuantity,
  isEqual,
  greaterThan,
} from '@melonproject/token-math/quantity';
import { Address } from '~/utils/types';
import {
  prepareTransaction,
  sendTransaction,
  getContract,
} from '~/utils/solidity';
import { getToken } from '~/contracts/dependencies/token';
import { isAddress } from '~/utils/checks';
import { ensure } from '~/utils/guards';
import { Contracts } from '~/Contracts';

const guards = async (
  engineAddress: Address,
  quantity: QuantityInterface,
  environment,
) => {
  const engine = getContract(Contracts.Engine, engineAddress);
  const mlnAddress = await engine.methods.mlnToken().call();
  const mlnTokenContract = getContract(Contracts.StandardToken, mlnAddress);
  const mlnToken = await getToken(mlnAddress);
  ensure(
    isSameToken(quantity.token, mlnToken),
    'It is only possible to burn MLN',
  );
  const allowedMln = createQuantity(
    mlnToken,
    await mlnTokenContract.methods
      .allowance(environment.wallet.address, engineAddress.toString())
      .call(),
  );
  ensure(
    isEqual(allowedMln, quantity) || greaterThan(allowedMln, quantity),
    `Amount must be approved prior to calling this function.`,
  );
};

const prepare = async (
  engineAddress: Address,
  quantity: QuantityInterface,
  environment,
) => {
  const contract = getContract(Contracts.Engine, engineAddress);
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
  quantity: QuantityInterface,
  environment?,
) => {
  await guards(engineAddress, quantity, environment);
  const transaction = await prepare(engineAddress, quantity, environment);
  const receipt = await sendTransaction(transaction, environment);
  const result = validateReceipt(receipt);
  return result;
};
