import { Address } from '@melonproject/token-math/address';
import {
  isToken,
  hasAddress,
  log,
  TokenInterface,
} from '@melonproject/token-math/token';
import { ensure } from '~/utils/guards/ensure';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';

interface IAddTokenPairWhitelist {
  quoteToken: TokenInterface;
  baseToken: TokenInterface;
}

export const guards = async (
  environment: Environment,
  contractAddress: Address,
  { quoteToken, baseToken },
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
  environment: Environment,
  contractAddress: Address,
  { quoteToken, baseToken },
) => {
  const contract = getContract(
    environment,
    Contracts.MatchingMarket,
    contractAddress,
  );

  const transaction = contract.methods.addTokenPairWhitelist(
    quoteToken.address,
    baseToken.address,
  );

  return transaction;
};

export const send = async (environment, transaction) => {
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
  environment: Environment,
  contractAddress: Address,
  params: IAddTokenPairWhitelist,
) => {
  await guards(environment, contractAddress, params);
  const transaction = await prepare(environment, contractAddress, params);
  const receipt = await send(environment, transaction);
  const result = validateReceipt(receipt, params);
  return result;
};
