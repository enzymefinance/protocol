import { Address } from '@melonproject/token-math';

import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { ensureFundOwner } from '../../trading/guards/ensureFundOwner';

export interface DisableInvestmentArgs {
  assets: Address[];
}

const guard = async (environment, params, contractAddress) => {
  ensureFundOwner(environment, contractAddress);
};

const prepareArgs: PrepareArgsFunction<DisableInvestmentArgs> = async (
  _,
  { assets },
) => {
  return [assets];
};

const postProcess = async (environment, receipt, params, contractAddress) => {
  return {
    assetsDisabled: receipt.events.DisableInvestment.returnValues._assets,
  };
};

const disableInvestment = transactionFactory(
  'disableInvestment',
  Contracts.Participation,
  guard,
  prepareArgs,
  postProcess,
);

export { disableInvestment };
