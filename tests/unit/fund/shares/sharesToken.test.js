import { call } from '~/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let weth, fundFactory;

beforeAll(async () => {
  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);
});

describe('constructor', () => {
  let fund;

  beforeAll(async () => {
    fund = await setupFundWithParams({
      quoteToken: weth.options.address,
      fundFactory
    }); 
  });

  it('assigns fund name as shares name', async () => {
    const fundName = await call(fund.hub, 'NAME');
    const sharesName = await call(fund.shares, 'name');
    expect(fundName).toBe(sharesName);
  });

  it('has expected symbols and decimals', async () => {
    await expect(call(fund.shares, 'symbol')).resolves.toBe('MLNF');
    await expect(call(fund.shares, 'decimals')).resolves.toBe('18');
  });
});
