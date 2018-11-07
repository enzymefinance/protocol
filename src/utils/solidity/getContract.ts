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
  VaultFactory = 'fund/vault/VaultFactory',
}

const requireMap = {
  'fund/accounting/Accounting': require('../../../out/fund/accounting/Accounting.abi.json'),
  'fund/fees/FeeManager': require('../../../out/fund/fees/FeeManager.abi.json'),
  'factory/FundFactory': require('../../../out/factory/FundFactory.abi.json'),
  'fund/hub/Hub': require('../../../out/fund/hub/Hub.abi.json'),
  'exchanges/MatchingMarket': require('../../../out/exchanges/MatchingMarket.abi.json'),
  'fund/participation/Participation': require('../../../out/fund/participation/Participation.abi.json'),
  'fund/policies/PolicyManager': require('../../../out/fund/policies/PolicyManager.abi.json'),
  'dependencies/token/PreminedToken': require('../../../out/dependencies/token/PreminedToken.abi.json'),
  'fund/shares/Shares': require('../../../out/fund/shares/Shares.abi.json'),
  'dependencies/token/StandardToken': require('../../../out/dependencies/token/StandardToken.abi.json'),
  'prices/TestingPriceFeed': require('../../../out/prices/TestingPriceFeed.abi.json'),
  'fund/trading/Trading': require('../../../out/fund/trading/Trading.abi.json'),
  'fund/vault/Vault': require('../../../out/fund/vault/Vault.abi.json'),
  'fund/vault/VaultFactory': require('../../../out/fund/vault/VaultFactory.abi.json'),
};

export const getContract: GetContractFunction = R.memoizeWith(
  // TODO: Make this work with separate environments
  (relativePath, address, environment) => `${relativePath}${address}`,
  (
    relativePath: Contract,
    address: Address,
    environment = getGlobalEnvironment(),
  ) => {
    const abi = requireMap[relativePath];
    const contract = new environment.eth.Contract(abi, address.toString());
    return contract;
  },
);
