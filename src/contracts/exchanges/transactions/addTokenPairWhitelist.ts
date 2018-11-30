import { Address } from '@melonproject/token-math/address';
import {
  isToken,
  hasAddress,
  log,
  TokenInterface,
} from '@melonproject/token-math/token';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { ensure } from '~/utils/guards/ensure';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

interface IAddTokenPairWhitelist {
  quoteToken: TokenInterface;
  baseToken: TokenInterface;
}

export const guards = async (
  contractAddress: Address,
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
  contractAddress: Address,
  { quoteToken, baseToken },
  environment,
) => {
  const contract = getContract(
    Contracts.MatchingMarket,
    contractAddress,
    environment,
  );
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

export const addTokenPairWhitelist = async (
  contractAddress: Address,
  params: IAddTokenPairWhitelist,
  environment = getGlobalEnvironment(),
) => {
  await guards(contractAddress, params, environment);
  const transaction = await prepare(contractAddress, params, environment);
  const receipt = await send(transaction, environment);
  const result = validateReceipt(receipt, params);
  return result;
};
