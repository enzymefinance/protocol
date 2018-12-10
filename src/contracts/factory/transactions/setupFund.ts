import {
  transactionFactory,
  PostProcessFunction,
} from '~/utils/solidity/transactionFactory';
import { managersToHubs } from '~/contracts/factory/calls/managersToHubs';
import { Environment } from '~/utils/environment/Environment';
import { Address } from '@melonproject/token-math/address';
import { Contracts } from '~/Contracts';

interface SetupFundArgs {}

type SetupFundResult = string;

const postProcess: PostProcessFunction<SetupFundArgs, SetupFundResult> = async (
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

export const setupFund = transactionFactory<SetupFundArgs, SetupFundResult>(
  'setupFund',
  Contracts.FundFactory,
  undefined,
  undefined,
  postProcess,
  {
    amguPayable: true,
  },
);
