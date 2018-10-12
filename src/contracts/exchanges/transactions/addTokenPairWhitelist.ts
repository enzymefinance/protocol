import { Token, IToken } from '@melonproject/token-math';

import getGlobalEnvironment from '~/utils/environment/getGlobalEnvironment';

import getContract from '../utils/getContract';
import ensure from '~/utils/guards/ensure';

const { isToken, hasAddress, log } = Token;

interface IAddTokenPairWhitelist {
  quoteToken: IToken;
  baseToken: IToken;
}

export const guards = async (
  contractAddress: string,
  { quoteToken, baseToken },
  environment,
) => {
  ensure(
    isToken(quoteToken) && hasAddress(quoteToken),
    `Token ${log(quoteToken)} is invalid`,
  );
  ensure(
    isToken(baseToken) && hasAddress(baseToken),
    `Token ${log(baseToken)} is invalid`,
  );
};

export const prepare = async (
  contractAddress: string,
  { quoteToken, baseToken },
) => {
  const contract = getContract(contractAddress);
  const transaction = contract.methods.addTokenPairWhitelist(
    quoteToken.address,
    baseToken.address,
  );
  return transaction;
};

export const send = async (
  transaction,
  environment = getGlobalEnvironment(),
) => {
  const receipt = await transaction.send({
    from: environment.wallet.address,
  });

  return receipt;
};

export const validateReceipt = (receipt, params) => {
  // TODO
  return true;
};

const addTokenPairWhitelist = async (
  contractAddress: string,
  params: IAddTokenPairWhitelist,
  environment?,
) => {
  await guards(contractAddress, params, environment);
  const transaction = await prepare(contractAddress, params);
  const receipt = await send(transaction, environment);
  const result = validateReceipt(receipt, params);
  return result;
};

export default addTokenPairWhitelist;
