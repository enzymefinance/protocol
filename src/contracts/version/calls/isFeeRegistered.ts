import { callFactory } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math';

interface IsFeeRegisteredArgs {
  fee: Address;
}

const prepareArgs = (_, { fee }: IsFeeRegisteredArgs) => {
  return [fee.toString()];
};

const isFeeRegistered = callFactory('isFeeRegistered', Contracts.Registry, {
  prepareArgs,
});

export { isFeeRegistered };
