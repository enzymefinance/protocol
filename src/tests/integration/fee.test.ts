import { allLogsWritten } from '../utils/testLogger';
import { Environment } from '~/utils/environment/Environment';
import { deployAndInitTestEnv } from '../utils/deployAndInitTestEnv';
import { setupInvestedTestFund } from '../utils/setupInvestedTestFund';
import { createPrice, createQuantity } from '@melonproject/token-math';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { update } from '~/contracts/prices/transactions/update';
import { getLogCurried } from '~/utils/environment/getLogCurried';
import { performCalculations } from '~/contracts/fund/accounting/calls/performCalculations';
import { delay } from 'rxjs/operators';
import { getFundDetails } from '~/contracts/factory/calls/getFundDetails';
import { getLatestBlock } from '~/utils/evm';

const getLog = getLogCurried('melon:protocol:systemTest:playground');

describe('feeTests', () => {
  const shared: {
    env?: Environment;
    [p: string]: any;
  } = {};

  beforeAll(async () => {
    shared.env = await deployAndInitTestEnv();
    shared.accounts = await shared.env.eth.getAccounts();
    shared.routes = await setupInvestedTestFund(shared.env);

    const weth = getTokenBySymbol(shared.env, 'WETH');
    const mln = getTokenBySymbol(shared.env, 'MLN');

    const mlnPrice = createPrice(
      createQuantity(mln, '1'),
      createQuantity(weth, '2'),
    );

    const ethPrice = createPrice(
      createQuantity(weth, '1'),
      createQuantity(weth, '1'),
    );

    await update(shared.env, shared.env.deployment.melonContracts.priceSource, [
      ethPrice,
      mlnPrice,
    ]);
  });

  afterAll(async () => {
    await allLogsWritten();
  });

  test('', async () => {
    const log = getLog(shared.env);

    const initialCalculations = await performCalculations(
      shared.env,
      shared.routes.accountingAddress,
    );

    const blockBefore = await getLatestBlock(shared.env);

    await delay(5000);

    const blockAfter = await getLatestBlock(shared.env);

    const ranking = await getFundDetails(shared.env);

    await delay(5000);

    const afterCalcs = await performCalculations(
      shared.env,
      shared.routes.accountingAddress,
    );

    log.debug({
      afterCalcs,
      blockAfter,
      blockBefore,
      initialCalculations,
      ranking,
    });

    expect(initialCalculations.sharePrice.quote.quantity.toString()).toEqual(
      ranking[0].sharePrice.quote.quantity.toString(),
    );

    expect(initialCalculations.sharePrice.quote.quantity.toString()).toEqual(
      afterCalcs.sharePrice.quote.quantity.toString(),
    );
  });
});
