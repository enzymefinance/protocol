import { send } from '~/deploy/utils/deploy-contract';
import { getDeployed } from '~/tests/utils/getDeployed';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import * as mainnetAddrs from '~/mainnet_thirdparty_contracts';

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
      defaultTokens: [weth.options.address],
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
