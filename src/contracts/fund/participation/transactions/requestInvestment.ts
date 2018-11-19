import {
  transactionFactory,
  GuardFunction,
  PrepareArgsFunction,
  PostProcessFunction,
} from '~/utils/solidity';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { getHub, ensureIsNotShutDown } from '../../hub';
import { approve } from '~/contracts/dependencies/token';
import { getRequest, RequestInvestmentResult } from '..';

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
  await approve({ howMuch: params.investmentAmount, spender: contractAddress });
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
