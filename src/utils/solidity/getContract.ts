import * as Eth from 'web3-eth';
import { Address } from '~/utils/types';
import { getGlobalEnvironment, Environment } from '~/utils/environment';
import { getContractWithPath } from '.';

export type GetContractFunction = (
  relativePath: Contract,
  address: Address,
  environment?: Environment,
) => typeof Eth.Contract;

export enum Contract {
  Accounting = 'fund/accounting/Accounting',
  Engine = 'engine/Engine',
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
  VaultFactory = 'fund/vault/VaultFactory',
}

export const getContract = (
  relativePath: Contract,
  address: Address,
  environment = getGlobalEnvironment(),
) => getContractWithPath(relativePath, address, environment);
