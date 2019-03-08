import {
  transactionFactory,
  GuardFunction,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { QuantityInterface } from '@melonproject/token-math';
import { Contracts } from '~/Contracts';
import { approve } from '~/contracts/dependencies/token/transactions/approve';
export interface SwapTokensFromAccountArgs {
  srcQuantity: QuantityInterface;
  destQuantity: QuantityInterface;
  minConversionRate: number;
}

//contractAddress must be kyberProxyContract address
const guard: GuardFunction<SwapTokensFromAccountArgs> = async (
  environment,
  params,
  contractAddress,
) => {
  await approve(environment, {
    howMuch: params.srcQuantity,
    spender: contractAddress,
  });
};

const prepareArgs: PrepareArgsFunction<SwapTokensFromAccountArgs> = async (
  _,
  { srcQuantity, destQuantity, minConversionRate },
) => {
  return [
    srcQuantity.token.address,
    srcQuantity.quantity.toString(),
    destQuantity.token.address,
    minConversionRate,
  ];
};

const postProcess = async (environment, receipt, params, contractAddress) => {
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
