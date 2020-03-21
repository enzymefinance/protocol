import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { send } from '~/deploy/utils/deploy-contract';
import getAccounts from '~/deploy/utils/getAccounts';

import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';

let deployer;
let defaultTxOpts;
let weth;

beforeAll(async () => {
  [deployer] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };

  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  const contracts = deployed.contracts;

  weth = contracts.WETH;
});

describe('withdraw', () => {
  let fund;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
    const contracts = deployed.contracts;
    const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

    fund = await setupFundWithParams({
      defaultTokens: [weth.options.address],
      quoteToken: weth.options.address,
      fundFactory
    });
  });

  it('can NOT be called by the fund manager', async () => {
    await expect(
      send(
        fund.vault,
        'withdraw',
        [weth.options.address, "1"],
        defaultTxOpts
      )
    ).rejects.toThrowFlexible("ds-auth-unauthorized")
  });
});
