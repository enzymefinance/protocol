import { send } from '~/utils/deploy-contract';
import { getDeployed } from '~/utils/getDeployed';
import { CONTRACT_NAMES } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import mainnetAddrs from '~/config';

let web3;
let deployer, manager;
let defaultTxOpts;
let weth;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };

  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
});

describe('withdraw', () => {
  let fund;

  beforeAll(async () => {
    const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);

    fund = await setupFundWithParams({
      quoteToken: weth.options.address,
      fundFactory,
      manager,
      web3
    });
  });

  test('can NOT be called by the fund manager', async () => {
    await expect(
      send(
        fund.vault,
        'withdraw',
        [weth.options.address, '1'],
        defaultTxOpts,
        web3
      )
    ).rejects.toThrowFlexible('Only Shares can call this function')
  });
});
