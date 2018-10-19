import * as R from 'ramda';
import * as Eth from 'web3-eth';
import { Address } from '~/utils/types';
import { getGlobalEnvironment, Environment } from '~/utils/environment';

export type GetContractFunction = (
  relativePath: Contract,
  address: Address,
  environment?: Environment,
) => typeof Eth.Contract;

export enum Contract {
  Accounting = 'fund/accounting/Accounting',
  FeeManager = 'fund/fees/FeeManager',
  FundFactory = 'factory/FundFactory',
  Hub = 'fund/hub/Hub',
  MatchingMarket = 'exchanges/MatchingMarket',
  Participation = 'fund/participation/Participation',
  PolicyManager = 'fund/policies/PolicyManager',
  PreminedToken = 'dependencies/token/PreminedToken',
  Shares = 'fund/shares/Shares',
  StandardToken = 'dependencies/token/StandardToken',
  TestingPriceFeed = 'prices/TestingPriceFeed',
  Trading = 'fund/trading/Trading',
  Vault = 'fund/vault/Vault',
}

export const getContract: GetContractFunction = R.memoizeWith(
  // TODO: Make this work with separate environments
  (relativePath, address, environment) => `${relativePath}${address}`,
  (
    relativePath: Contract,
    address: Address,
    environment = getGlobalEnvironment(),
  ) => {
    const abi = require(`~/../out/${relativePath}.abi.json`);
    const contract = new environment.eth.Contract(abi, address);
    return contract;
  },
);
