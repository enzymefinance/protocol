import { Address } from '@melonproject/token-math';

import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { ensureFundOwner } from '../../trading/guards/ensureFundOwner';

export interface EnableInvestmentArgs {
  assets: Address[];
}

const guard = async (environment, params, contractAddress) => {
  ensureFundOwner(environment, contractAddress);
};

const prepareArgs: PrepareArgsFunction<EnableInvestmentArgs> = async (
  _,
  { assets },
) => {
  return [assets];
};

const postProcess = async (environment, receipt, params, contractAddress) => {
  return {
    assetsEnabled: receipt.events.EnableInvestment.returnValues._assets,
  };
};

const enableInvestment = transactionFactory(
  'enableInvestment',
  Contracts.Participation,
  guard,
  prepareArgs,
  postProcess,
);

export { enableInvestment };
