import {
  transactionFactory,
  PostProcessFunction,
} from '~/utils/solidity/transactionFactory';
import { managersToHubs } from '~/contracts/factory/calls/managersToHubs';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { Contracts } from '~/Contracts';

interface SetupFundArgs {}

type SetupFundResult = string;

const postProcess: PostProcessFunction<SetupFundArgs, SetupFundResult> = async (
  receipt,
  params,
  contractAddress,
  environment = getGlobalEnvironment(),
) => {
  return managersToHubs(
    contractAddress,
    environment.wallet.address,
    environment,
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
