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
import { getRequest, RequestInvestmentResult } from '../calls/getRequest';
import { ensureAllowance } from '~/contracts/dependencies/token/guards/ensureAllowance';

export interface RequestInvestmentArgs {
  investmentAmount: QuantityInterface;
  requestedShares?: QuantityInterface;
}

const guard: GuardFunction<RequestInvestmentArgs> = async (
  params,
  contractAddress,
  environment,
) => {
  const hub = await getHub(contractAddress, environment);
  await ensureIsNotShutDown(hub, environment);
  await ensureAllowance(params.investmentAmount, contractAddress, environment);
};

const prepareArgs: PrepareArgsFunction<RequestInvestmentArgs> = async ({
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

const postProcess: PostProcessFunction<
  RequestInvestmentArgs,
  RequestInvestmentResult
> = async (receipt, params, contractAddress, environment) => {
  const request = await getRequest(contractAddress, {
    of: environment.wallet.address,
  });
  return request;
};

const requestInvestment = transactionFactory<
  RequestInvestmentArgs,
  RequestInvestmentResult
>(
  'requestInvestment',
  Contracts.Participation,
  guard,
  prepareArgs,
  postProcess,
  { amguPayable: true },
);

export { requestInvestment };
