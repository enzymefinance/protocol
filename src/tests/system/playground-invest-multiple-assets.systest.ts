import { getBalance } from '~/utils/evm/getBalance';
import { withNewAccount } from '~/utils/environment/withNewAccount';
import { createQuantity, greaterThan, valueIn } from '@melonproject/token-math';
import { sendEth } from '~/utils/evm/sendEth';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { getPrice } from '~/contracts/prices/calls/getPrice';
import { toBeTrueWith } from '../utils/toBeTrueWith';
import { getSystemTestEnvironment } from '../utils/getSystemTestEnvironment';
import { Tracks } from '~/utils/environment/Environment';
import { getLogCurried } from '~/utils/environment/getLogCurried';
import { performCalculations } from '~/contracts/fund/accounting/calls/performCalculations';
import { allLogsWritten } from '../utils/testLogger';
import { setupFund } from '~/contracts/fund/hub/transactions/setupFund';
import { requestInvestment } from '~/contracts/fund/participation/transactions/requestInvestment';
import { approve } from '~/contracts/dependencies/token/transactions/approve';
import { executeRequestFor } from '~/contracts/fund/participation/transactions/executeRequestFor';
import { transfer } from '~/contracts/dependencies/token/transactions/transfer';
import { enableInvestment } from '~/contracts/fund/participation/transactions/enableInvestment';
import { investAllowed } from '~/contracts/fund/participation/calls/investAllowed';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { getShareCostInAsset } from '~/contracts/fund/accounting/calls/getShareCostInAsset';

expect.extend({ toBeTrueWith });

const getLog = getLogCurried(
  'melon:protocol:systemTest:playground-multiple-investors',
);

describe('playground', () => {
  afterAll(async () => {
    await allLogsWritten();
  });

  test('Happy path', async () => {
    const master = await getSystemTestEnvironment(Tracks.KYBER_PRICE);

    const log = getLog(master);

    const { melonContracts } = master.deployment;

    const manager = await withNewAccount(master);
    const investor1 = await withNewAccount(master);

    log.debug('Manager ', manager.wallet.address);
    log.debug('Investor 1 ', investor1.wallet.address);

    const mln = getTokenBySymbol(manager, 'MLN');
    try {
      const mlnPrice = await getPrice(
        master,
        melonContracts.priceSource.toString(),
        mln,
      );

      log.debug('MLN Price', mlnPrice);
    } catch (e) {
      throw new Error('Cannot get MLN Price from Kyber');
    }

    const masterBalance = await getBalance(master);

    expect(masterBalance).toBeTrueWith(
      greaterThan,
      createQuantity(masterBalance.token, 6),
    );

    await sendEth(master, {
      howMuch: createQuantity('ETH', 3),
      to: manager.wallet.address,
    });

    const routes = await setupFund(manager);
    const fundToken = await getToken(manager, routes.sharesAddress);

    log.debug('Routes of new fund are ', routes);

    // Manager enables investment in MLN

    await enableInvestment(manager, routes.participationAddress, {
      assets: [mln.address],
    });
    log.debug('Enabled investment for ', [mln.symbol]);

    const allowed = await investAllowed(manager, routes.participationAddress, {
      asset: mln.address,
    });

    expect(allowed).toBeTruthy();

    // Investor 1 requests investment 80 MLN
    await sendEth(master, {
      howMuch: createQuantity('ETH', 3),
      to: investor1.wallet.address,
    });
    await transfer(master, {
      howMuch: createQuantity(mln, 80),
      to: investor1.wallet.address,
    });

    const investor1Quantity = createQuantity(mln, 80);

    await approve(investor1, {
      howMuch: investor1Quantity,
      spender: routes.participationAddress,
    });

    const shareCostInMLN = await getShareCostInAsset(
      investor1,
      routes.accountingAddress,
      { assetToken: mln, fundToken },
    );

    const requestedShares = createQuantity(fundToken, 5);

    const investmentAmount = valueIn(shareCostInMLN, requestedShares);

    await requestInvestment(investor1, routes.participationAddress, {
      investmentAmount,
      requestedShares,
    });

    const investor1Investment = await executeRequestFor(
      investor1,
      routes.participationAddress,
      { who: investor1.wallet.address },
    );

    log.debug('Investor 1 investment ', investor1Investment);

    const finalCalculations = await performCalculations(
      manager,
      routes.accountingAddress,
    );
    log.debug('Final calculations ', finalCalculations);
  });
});
