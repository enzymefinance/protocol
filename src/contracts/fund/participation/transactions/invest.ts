import {
  transactionFactory,
  GuardFunction,
  PrepareArgsFunction,
  PostProcessFunction,
} from '~/utils/solidity/transactionFactory';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { ensureIsNotShutDown } from '~/contracts/fund/hub/guards/ensureIsNotShutDown';
import { ensureAllowance } from '~/contracts/dependencies/token/guards/ensureAllowance';

export interface InvestArgs {
  investmentAmount: QuantityInterface;
  requestedShares?: QuantityInterface;
}

const guard: GuardFunction<InvestArgs> = async (
  params,
  contractAddress,
  environment,
) => {
  const hub = await getHub(contractAddress, environment);
  await ensureIsNotShutDown(hub, environment);
  await ensureAllowance(params.investmentAmount, contractAddress, environment);
};

const prepareArgs: PrepareArgsFunction<InvestArgs> = async ({
  investmentAmount,
  requestedShares,
}) => {
  // TODO: check how many shares the investAmount is worth
  const requestedSharesArg = requestedShares
    ? requestedShares.quantity.toString()
    : investmentAmount.quantity.toString();
  const investmentAmountArg = investmentAmount.quantity.toString();
  const investmentAssetArg = investmentAmount.token.address;
  const args = [requestedSharesArg, investmentAmountArg, investmentAssetArg];
  return args;
};

const postProcess: PostProcessFunction<InvestArgs, Boolean> = async (
  receipt,
  params,
  contractAddress,
  environment,
) => {
  // TODO: add check for success
  return true;
};

const invest = transactionFactory<InvestArgs, Boolean>(
  'invest',
  Contracts.Participation,
  guard,
  prepareArgs,
  postProcess,
  { amguPayable: true },
);

export { invest };
