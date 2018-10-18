import * as fs from 'fs';
import * as path from 'path';
import * as R from 'ramda';
import { Address } from '~/utils/types';
import { getGlobalEnvironment } from '~/utils/environment/getGlobalEnvironment';

export enum ContractPath {
  Accounting = 'fund/accounting/Accounting',
  FeeManager = 'fund/fees/FeeManager',
  FundFactory = 'factory/FundFactory',
  Hub = 'fund/hub/Hub',
  MatchingMarket = 'exchanges/MatchingMarket',
  Participation = 'fund/participation/Participation',
  PolicyManager = 'fund/policies/PolicyManager',
  Shares = 'fund/shares/Shares',
  TestingPriceFeed = 'prices/TestingPriceFeed',
  Trading = 'fund/trading/Trading',
  Vault = 'fund/vault/Vault',
}

export const getContract = R.memoizeWith(
  R.identity,
  (contractPath, address: Address, environment = getGlobalEnvironment()) => {
    const rawABI = fs.readFileSync(
      path.join(process.cwd(), 'out', `${contractPath}.abi`),
      { encoding: 'utf-8' },
    );
    const ABI = JSON.parse(rawABI);
    const contract = new environment.eth.Contract(ABI, address);
    return contract;
  },
);
