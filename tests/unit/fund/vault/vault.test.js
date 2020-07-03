import { send } from '~/utils/deploy-contract';
import { getDeployed } from '~/utils/getDeployed';
import { CONTRACT_NAMES } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import mainnetAddrs from '~/config';

let deployer, manager;
let defaultTxOpts;
let weth;

beforeAll(async () => {
  [deployer, manager] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };

  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);
});

describe('withdraw', () => {
  let fund;

  beforeAll(async () => {
    const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);

    fund = await setupFundWithParams({
      quoteToken: weth.options.address,
      fundFactory,
      manager
    });
  });

  test('can NOT be called by the fund manager', async () => {
    await expect(
      send(
        fund.vault,
        'withdraw',
        [weth.options.address, '1'],
        defaultTxOpts
      )
    ).rejects.toThrowFlexible('Only Shares can call this function')
  });
});
