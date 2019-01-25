// import { getBalance } from '~/utils/evm/getBalance';
// import { withNewAccount } from '~/utils/environment/withNewAccount';
// import { createQuantity, greaterThan, toFixed } from '@melonproject/token-math';
// import { sendEth } from '~/utils/evm/sendEth';
// import { deposit } from '~/contracts/dependencies/token/transactions/deposit';
// import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
// import { getPrice } from '~/contracts/prices/calls/getPrice';
// import { toBeTrueWith } from '../utils/toBeTrueWith';
// import { getSystemTestEnvironment } from '../utils/getSystemTestEnvironment';
// import { Tracks } from '~/utils/environment/Environment';
// import { getLogCurried } from '~/utils/environment/getLogCurried';
// import { performCalculations } from '~/contracts/fund/accounting/calls/performCalculations';
// import { allLogsWritten } from '../utils/testLogger';
// import { setupFund } from '~/contracts/fund/hub/transactions/setupFund';
// import { invest } from '~/contracts/fund/participation/transactions/invest';
// import { requestInvestment } from '~/contracts/fund/participation/transactions/requestInvestment';
// import { approve } from '~/contracts/dependencies/token/transactions/approve';
// import { executeRequestFor } from '~/contracts/fund/participation/transactions/executeRequestFor';
// import { delay } from '../utils/delay';

// expect.extend({ toBeTrueWith });

// const getLog = getLogCurried(
//   'melon:protocol:systemTest:playground-multiple-investors',
// );

// describe('playground', () => {
//   afterAll(async () => {
//     await allLogsWritten();
//   });

//   test('Happy path', async () => {
//     const master = await getSystemTestEnvironment(Tracks.KYBER_PRICE);

//     const log = getLog(master);

//     const { melonContracts } = master.deployment;

//     const manager = await withNewAccount(master);
//     const investor1 = await withNewAccount(master);
//     const investor2 = await withNewAccount(master);
//     const investor3 = await withNewAccount(master);

//     log.debug('Manager ', manager.wallet.address);
//     log.debug('Investor 1 ', investor1.wallet.address);
//     log.debug('Investor 2 ', investor2.wallet.address);

//     const weth = getTokenBySymbol(manager, 'WETH');
//     const mln = getTokenBySymbol(manager, 'MLN');

//     try {
//       const mlnPrice = await getPrice(
//         master,
//         melonContracts.priceSource.toString(),
//         mln,
//       );

//       log.debug('MLN Price', mlnPrice);
//     } catch (e) {
//       throw new Error('Cannot get MLN Price from Kyber');
//     }

//     const masterBalance = await getBalance(master);

//     expect(masterBalance).toBeTrueWith(
//       greaterThan,
//       createQuantity(masterBalance.token, 6),
//     );

//     await sendEth(master, {
//       howMuch: createQuantity('ETH', 3),
//       to: manager.wallet.address,
//     });

//     const routes = await setupFund(manager);

//     log.debug('Routes of new fund are ', routes);

//     // Manager invests in his own fund
//     const managerQuantity = createQuantity(weth, 0.5);

//     await deposit(manager, managerQuantity.token.address, undefined, {
//       value: managerQuantity.quantity.toString(),
//     });
//     const managerInvestment = await invest(manager, {
//       hubAddress: routes.hubAddress,
//       investmentAmount: managerQuantity,
//     });

//     log.debug('Manager investment ', managerInvestment);

//     // Investor 1 requests investment 1 WETH
//     await sendEth(master, {
//       howMuch: createQuantity('ETH', 3),
//       to: investor1.wallet.address,
//     });
//     const investor1Quantity = createQuantity(weth, 1);
//     await deposit(investor1, investor1Quantity.token.address, undefined, {
//       value: investor1Quantity.quantity.toString(),
//     });

//     await approve(investor1, {
//       howMuch: investor1Quantity,
//       spender: routes.participationAddress,
//     });

//     await requestInvestment(investor1, routes.participationAddress, {
//       investmentAmount: investor1Quantity,
//     });

//     // Investor 2 requests investment 2 WETH
//     await sendEth(master, {
//       howMuch: createQuantity('ETH', 4),
//       to: investor2.wallet.address,
//     });
//     const investor2Quantity = createQuantity(weth, 2);
//     await deposit(investor2, investor2Quantity.token.address, undefined, {
//       value: investor2Quantity.quantity.toString(),
//     });

//     await approve(investor2, {
//       howMuch: investor2Quantity,
//       spender: routes.participationAddress,
//     });

//     await requestInvestment(investor2, routes.participationAddress, {
//       investmentAmount: investor2Quantity,
//     });

//     // Investor 3 requests investment 3 WETH

//     await sendEth(master, {
//       howMuch: createQuantity('ETH', 5),
//       to: investor3.wallet.address,
//     });
//     const investor3Quantity = createQuantity(weth, 3);
//     await deposit(investor3, investor3Quantity.token.address, undefined, {
//       value: investor3Quantity.quantity.toString(),
//     });

//     await approve(investor3, {
//       howMuch: investor3Quantity,
//       spender: routes.participationAddress,
//     });

//     await requestInvestment(investor3, routes.participationAddress, {
//       investmentAmount: investor3Quantity,
//     });

//     /// Execute 3 requests after some time has passed

//     await delay(180000);

//     const investor1Investment = await executeRequestFor(
//       investor1,
//       routes.participationAddress,
//       { who: investor1.wallet.address },
//     );

//     log.debug('Investor 1 investment ', investor1Investment);

//     const investor2Investment = await executeRequestFor(
//       investor2,
//       routes.participationAddress,
//       { who: investor2.wallet.address },
//     );

//     log.debug('Investor 2 investment ', investor2Investment);

//     const investor3Investment = await executeRequestFor(
//       investor3,
//       routes.participationAddress,
//       { who: investor3.wallet.address },
//     );

//     log.debug('Investor 3 investment ', investor3Investment);

//     const finalCalculations = await performCalculations(
//       manager,
//       routes.accountingAddress,
//     );

//     expect(toFixed(finalCalculations.gav)).toEqual('6.499998');
//     log.debug('Final calculations ', finalCalculations);
//   });
// });
