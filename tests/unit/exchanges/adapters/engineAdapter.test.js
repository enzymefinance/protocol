/*
 * @file Unit tests for vault via the EngineAdapter (input validation only)
 *
 * @dev This file only contains tests for callOnIntegration param validation.
 * Other tests rely on EVM manipulation not allowed on testnets (only local blockchain).
 * Those tests are in engineAdapterLocal.test.js
 * All funds are denominated in MLN so that funds can receive MLN as investment
 */

import { toWei } from 'web3-utils';
import { send } from '~/utils/deploy-contract';
import { CALL_ON_INTEGRATION_ENCODING_TYPES, CONTRACT_NAMES } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import { getFunctionSignature } from '~/utils/metadata';
import { encodeArgs } from '~/utils/formatting';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let deployer, manager;
let dai, mln, weth, engineAdapter, fundFactory;
let managerTxOpts;
let fund;
let takeOrderSignature;

beforeAll(async () => {
  [deployer, manager] = await web3.eth.getAccounts();
  managerTxOpts = { from: manager, gas: 8000000 };

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ENGINE_ADAPTER,
    'takeOrder',
  );

  dai = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.DAI);
  mln = getDeployed(CONTRACT_NAMES.ERC20_WITH_FIELDS, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);
  engineAdapter = getDeployed(CONTRACT_NAMES.ENGINE_ADAPTER);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);
});

describe('takeOrder', () => {
  beforeAll(async () => {
    fund = await setupFundWithParams({
      integrationAdapters: [engineAdapter.options.address],
      initialInvestment: {
        contribAmount: toWei('1', 'ether'),
        investor: deployer,
        tokenContract: mln
      },
      manager,
      quoteToken: mln.options.address,
      fundFactory
    });
  });

  it('does not allow trade when no ether in engine', async () => {
    const { vault } = fund;

    const encodedArgs = encodeArgs(
      CALL_ON_INTEGRATION_ENCODING_TYPES.ENGINE.TAKE_ORDER,
      [
        '0', // min incoming asset (WETH) amount
        toWei('0.01', 'ether') // exact outgoing asset (MLN) amount
      ]
    );

    await expect(
      send(
        vault,
        'callOnIntegration',
        [
          engineAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        managerTxOpts
      )
    ).rejects.toThrowFlexible("Not enough liquid ether to send")
  });
});
