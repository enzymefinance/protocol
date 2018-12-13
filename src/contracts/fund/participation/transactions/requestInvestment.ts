import {
  transactionFactory,
  GuardFunction,
  PrepareArgsFunction,
  PostProcessFunction,
  EnhancedExecute,
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
  environment,
  params,
  contractAddress,
) => {
  const hub = await getHub(environment, contractAddress);
  await ensureIsNotShutDown(environment, hub);
  await ensureAllowance(environment, params.investmentAmount, contractAddress);
};

const prepareArgs: PrepareArgsFunction<RequestInvestmentArgs> = async (
  _,
  { investmentAmount, requestedShares },
) => {
  // TODO: check how many shares the investAmount is worth
  const requestedSharesArg = requestedShares
    ? requestedShares.quantity.toString()
    : investmentAmount.quantity.toString();
  const investmentAmountArg = investmentAmount.quantity.toString();
  const investmentAssetArg = investmentAmount.token.address;
  const args = [
    requestedSharesArg,
    investmentAmountArg,
    `${investmentAssetArg}`,
  ];
  return args;
};

const postProcess: PostProcessFunction<
  RequestInvestmentArgs,
  RequestInvestmentResult
> = async (environment, receipt, params, contractAddress) => {
  const request = await getRequest(environment, contractAddress, {
    of: environment.wallet.address,
  });
  return request;
};

const requestInvestment: EnhancedExecute<
  RequestInvestmentArgs,
  RequestInvestmentResult
> = transactionFactory(
  'requestInvestment',
  Contracts.Participation,
  guard,
  prepareArgs,
  postProcess,
  { amguPayable: true },
);

export { requestInvestment };
