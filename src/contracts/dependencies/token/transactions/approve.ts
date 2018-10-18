import { IQuantity } from '@melonproject/token-math';

import { Address } from '~/utils/types';
import { prepareTransaction, sendTransaction } from '~/utils/solidity';
import { isAddress } from '~/utils/checks';
import { ensure } from '~/utils/guards';

import { getContract } from '..';

const guards = async (howMuch, spender, environment) => {
  ensure(
    isAddress(spender),
    `Spender is not an address. Got: ${spender}`,
    spender,
  );
  ensure(
    isAddress(howMuch.address),
    `Spend token needs to have an address. Got: ${howMuch.address}`,
    spender,
  );
};

const prepare = async (howMuch, spender, environment) => {
  const contract = getContract(howMuch.address);
  const transaction = contract.methods.approve(
    spender.toString(),
    howMuch.quantity.toString(),
  );
  transaction.name = 'approve';
  const prepared = await prepareTransaction(transaction, environment);
  return prepared;
};

const validateReceipt = receipt => {
  return true;
};

// tslint:disable-next-line:variable-name
export const approve = async (
  howMuch: IQuantity,
  spender: Address,
  environment?,
) => {
  await guards(howMuch, spender, environment);
  const transaction = await prepare(howMuch, spender, environment);
  const receipt = await sendTransaction(transaction, environment);
  const result = validateReceipt(receipt);
  return result;
};
