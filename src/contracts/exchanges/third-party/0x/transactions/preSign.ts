import { Address } from '@melonproject/token-math';
import { orderHashUtils } from '@0x/order-utils';
import { SignedOrder } from '@0x/types';
import { Contracts } from '~/Contracts';
import {
  PrepareArgsFunction,
  EnhancedExecute,
  transactionFactory,
} from '~/utils/solidity/transactionFactory';

interface PreSignArgs {
  signedOrder: SignedOrder;
  signerAddress?: Address;
}

type PreSignResult = boolean;

const prepareArgs: PrepareArgsFunction<PreSignArgs> = async (
  environment,
  { signedOrder, signerAddress: providedSignerAddress },
  contractAddress,
) => {
  const hash = orderHashUtils.getOrderHashHex(signedOrder);
  const signerAddress = providedSignerAddress || environment.wallet.address;
  const args = [hash, signerAddress.toLocaleLowerCase(), signedOrder.signature];
  return args;
};

const preSign: EnhancedExecute<PreSignArgs, PreSignResult> = transactionFactory(
  'preSign',
  Contracts.ZeroExExchange,
  undefined,
  prepareArgs,
);

export { preSign };
