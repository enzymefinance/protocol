import {
  transactionFactory,
  PostProcessFunction,
} from '~/utils/solidity/transactionFactory';
import { managersToHubs } from '~/contracts/factory/calls/managersToHubs';
import { Environment } from '~/utils/environment/Environment';
import { Address } from '@melonproject/token-math';
import { Contracts } from '~/Contracts';

interface CompleteSetupArgs {}

type CompleteSetupResult = string;

const postProcess: PostProcessFunction<
  CompleteSetupArgs,
  CompleteSetupResult
> = async (
  environment: Environment,
  receipt,
  params,
  contractAddress: Address,
) => {
  return managersToHubs(
    environment,
    contractAddress,
    environment.wallet.address,
  );
};

export const completeSetup = transactionFactory(
  'completeSetup',
  Contracts.FundFactory,
  undefined,
  undefined,
  postProcess,
  { amguPayable: true },
);
