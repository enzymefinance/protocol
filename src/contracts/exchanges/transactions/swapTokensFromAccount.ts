import {
  transactionFactory,
  GuardFunction,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { approve } from '~/contracts/dependencies/token/transactions/approve';
export interface SwapTokensFromAccountArgs {
  srcQuantity: QuantityInterface;
  destQuantity: QuantityInterface;
  minConversionRate: number;
}

//contractAddress must be kyberProxyContract address
const guard: GuardFunction<SwapTokensFromAccountArgs> = async (
  params,
  contractAddress,
  environment,
) => {
  await approve({ howMuch: params.srcQuantity, spender: contractAddress });
};

const prepareArgs: PrepareArgsFunction<SwapTokensFromAccountArgs> = async ({
  srcQuantity,
  destQuantity,
  minConversionRate,
}) => {
  return [
    srcQuantity.token.address,
    srcQuantity.quantity.toString(),
    destQuantity.token.address,
    minConversionRate,
  ];
};

const postProcess = async (receipt, params, contractAddress, environment) => {
  return receipt;
};

const swapTokensFromAccount = transactionFactory(
  'swapTokenToToken',
  Contracts.KyberNetworkProxy,
  guard,
  prepareArgs,
  postProcess,
);

export { swapTokensFromAccount };
