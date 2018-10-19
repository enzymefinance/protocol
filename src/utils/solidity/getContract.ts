import * as fs from 'fs';
import * as path from 'path';
import * as R from 'ramda';
import { Address } from '~/utils/types';
import { getGlobalEnvironment } from '~/utils/environment/getGlobalEnvironment';

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

export const getContract = R.memoizeWith(
  R.identity,
  (
    relativePath: Contract,
    address: Address,
    environment = getGlobalEnvironment(),
  ) => {
    const rawABI = fs.readFileSync(
      path.join(process.cwd(), 'out', `${relativePath}.abi`),
      { encoding: 'utf-8' },
    );
    const ABI = JSON.parse(rawABI);
    const contract = new environment.eth.Contract(ABI, address);
    return contract;
  },
);
