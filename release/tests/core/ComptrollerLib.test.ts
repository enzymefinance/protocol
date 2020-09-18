import {
  BuidlerProvider,
  randomAddress,
  contract,
  Send,
  Contract,
} from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { constants, utils } from 'ethers';
import { defaultTestDeployment } from '../../';
import { ComptrollerLib } from '../../utils/contracts';
import { buyShares, createNewFund, redeemShares, sighash } from '../utils';

// prettier-ignore
interface MockExternalContract extends Contract<MockExternalContract> {
  functionA: Send<() => void, MockExternalContract>
  functionB: Send<() => void, MockExternalContract>
  'functionA()': Send<() => void, MockExternalContract>
  'functionB()': Send<() => void, MockExternalContract>
}

// prettier-ignore
const MockExternalContract = contract.fromSignatures<MockExternalContract>`
  function functionA()
  function functionB()
`;

async function snapshot(provider: BuidlerProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  return {
    accounts,
    deployment,
    config,
  };
}

async function snapshotWithFund(provider: BuidlerProvider) {
  const { accounts, deployment, config } = await provider.snapshot(snapshot);

  const [fundOwner, ...remainingAccounts] = accounts;
  const denominationAsset = deployment.tokens.weth;
  const { comptrollerProxy, newFundTx, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset,
  });

  return {
    accounts: remainingAccounts,
    config,
    deployment,
    fund: {
      comptrollerProxy,
      denominationAsset,
      fundOwner,
      newFundTx,
      vaultProxy,
    },
  };
}

describe('constructor', () => {
  it('sets initial state for library', async () => {
    const {
      deployment: {
        comptrollerLib,
        engine,
        aggregatedDerivativePriceFeed,
        chainlinkPriceFeed,
        policyManager,
        feeManager,
        integrationManager,
        valueInterpreter,
      },
    } = await provider.snapshot(snapshot);

    const routesCall = comptrollerLib.getRoutes();
    await expect(routesCall).resolves.toMatchObject({
      derivativePriceFeed_: aggregatedDerivativePriceFeed.address,
      feeManager_: feeManager.address,
      integrationManager_: integrationManager.address,
      policyManager_: policyManager.address,
      primitivePriceFeed_: chainlinkPriceFeed.address,
      valueInterpreter_: valueInterpreter.address,
    });

    const engineCall = comptrollerLib.getEngine();
    await expect(engineCall).resolves.toBe(engine.address);

    // The following should be default values

    const denominationAssetCall = comptrollerLib.getDenominationAsset();
    await expect(denominationAssetCall).resolves.toBe(constants.AddressZero);

    const initializedCall = comptrollerLib.getInitialized();
    await expect(initializedCall).resolves.toBe(false);

    const vaultProxyCall = comptrollerLib.getVaultProxy();
    await expect(vaultProxyCall).resolves.toBe(constants.AddressZero);
  });
});

describe('init', () => {
  it('can only be called by FundDeployer', async () => {
    const {
      accounts: { 0: fakeFundDeployer },
      config: { deployer },
    } = await provider.snapshot(snapshot);

    const comptrollerLib = await ComptrollerLib.deploy(
      deployer,
      fakeFundDeployer,
      randomAddress(),
      randomAddress(),
      randomAddress(),
      randomAddress(),
      randomAddress(),
      randomAddress(),
      randomAddress(),
    );

    const badInitTx = comptrollerLib.init();
    await expect(badInitTx).rejects.toBeRevertedWith(
      'Only the FundDeployer can call this function',
    );

    const goodInitTx = comptrollerLib.connect(fakeFundDeployer).init();
    await expect(goodInitTx).resolves.toBeReceipt();
  });

  it('can only be called once', async () => {
    const {
      accounts: { 0: fakeFundDeployer },
      config: { deployer },
    } = await provider.snapshot(snapshot);

    const comptrollerLib = (
      await ComptrollerLib.deploy(
        deployer,
        fakeFundDeployer,
        randomAddress(),
        randomAddress(),
        randomAddress(),
        randomAddress(),
        randomAddress(),
        randomAddress(),
        randomAddress(),
      )
    ).connect(fakeFundDeployer);

    // First init should succeed
    await comptrollerLib.init();

    // Second init should fail
    const badInitTx = comptrollerLib.init();
    await expect(badInitTx).rejects.toBeRevertedWith(
      'Proxy already initialized',
    );
  });
});

describe('setFundConfigAndActivate', () => {
  it.todo('can only be called by FundDeployer');

  it.todo('can only be called once');

  it.todo('write other todos');
});

describe('buyShares', () => {
  it('works for a fund with no extensions', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
      accounts: { 0: signer, 1: buyer },
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer,
      fundDeployer,
      denominationAsset,
    });

    const investmentAmount = utils.parseEther('2');

    const buySharesTx = buyShares({
      comptrollerProxy,
      signer,
      buyer,
      denominationAsset,
      investmentAmount,
    });
    await expect(buySharesTx).resolves.toBeReceipt();

    // Assert Events
    await assertEvent(buySharesTx, 'SharesBought', {
      caller: await signer.getAddress(),
      buyer: await buyer.getAddress(),
      investmentAmount,
      sharesBought: investmentAmount,
      sharesReceived: investmentAmount,
    });

    // Assert calls on ComptrollerProxy
    const calcGavCall = comptrollerProxy.calcGav.call();
    await expect(calcGavCall).resolves.toEqBigNumber(investmentAmount);

    const calcGrossShareValueCall = comptrollerProxy.calcGrossShareValue.call();
    await expect(calcGrossShareValueCall).resolves.toEqBigNumber(
      utils.parseEther('1'),
    );

    // Assert calls on VaultProxy
    // TODO: does this belong here?
    const sharesBuyerBalanceCall = vaultProxy.balanceOf(buyer);
    await expect(sharesBuyerBalanceCall).resolves.toEqBigNumber(
      investmentAmount,
    );
    const sharesTotalSupplyCall = vaultProxy.totalSupply();
    await expect(sharesTotalSupplyCall).resolves.toEqBigNumber(
      await sharesBuyerBalanceCall,
    );
    const trackedAssetsCall = vaultProxy.getTrackedAssets();
    await expect(trackedAssetsCall).resolves.toContain(
      denominationAsset.address,
    );
    const isTrackedAssetCall = vaultProxy.isTrackedAsset(denominationAsset);
    await expect(isTrackedAssetCall).resolves.toBe(true);
  });
});

describe('__redeemShares', () => {
  it.todo('make test todos');
});

describe('redeemShares', () => {
  it('allows sender to redeem all their shares', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
      accounts: { 0: fundManager, 1: investor },
    } = await provider.snapshot(snapshot);

    const preBuyInvestorInvestmentAssetBalanceCall = denominationAsset.balanceOf(
      investor,
    );

    const investmentAmount = utils.parseEther('2');
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
      investment: {
        signer: investor,
        buyer: investor,
        investmentAmount,
      },
    });

    const redeemSharesTx = redeemShares({
      comptrollerProxy,
      signer: investor,
    });
    await expect(redeemSharesTx).resolves.toBeReceipt();

    // Redeemer should have their investment amount back and 0 shares
    const investorSharesBalanceCall = vaultProxy.balanceOf(investor);
    await expect(investorSharesBalanceCall).resolves.toEqBigNumber(0);

    const postRedeemInvestorInvestmentAssetBalanceCall = denominationAsset.balanceOf(
      investor,
    );
    await expect(
      postRedeemInvestorInvestmentAssetBalanceCall,
    ).resolves.toEqBigNumber(await preBuyInvestorInvestmentAssetBalanceCall);
  });
});

describe('redeemSharesEmergency', () => {
  it.todo('make test todos');
});

describe('redeemSharesQuantity', () => {
  it.todo('make test todos');
});

describe('vaultCallOnContract', () => {
  it.todo('does not allow a call from a random user');

  it.todo('does not allow a call to an unregistered contract');

  it('only calls a registered function on an external contract, and not another function on the same contract', async () => {
    const {
      config: { deployer },
      deployment: {
        fundDeployer,
        // tokens: { weth: denominationAsset },
      },
      // accounts: { 0: fundManager, 1: investor },
      fund: { comptrollerProxy },
    } = await provider.snapshot(snapshotWithFund);

    // Define a mock external contract to call with 2 functions
    const mockExternalContract = await MockExternalContract.mock(deployer);
    await mockExternalContract.functionA.returns(undefined);
    await mockExternalContract.functionB.returns(undefined);

    const unregisteredFunctionSelector = sighash(
      mockExternalContract.functionB.fragment,
    );
    const registeredFunctionSelector = sighash(
      mockExternalContract.functionA.fragment,
    );

    // Register one of the calls
    await fundDeployer.registerVaultCalls(
      [mockExternalContract.address],
      [registeredFunctionSelector],
    );

    // The unregistered call should fail
    const unregisteredCall = comptrollerProxy.vaultCallOnContract(
      mockExternalContract,
      unregisteredFunctionSelector,
      '0x',
    );
    await expect(unregisteredCall).rejects.toBeRevertedWith(
      'not a registered call',
    );

    // The registered call should succeed
    const registeredCall = comptrollerProxy.vaultCallOnContract(
      mockExternalContract,
      registeredFunctionSelector,
      '0x',
    );
    await expect(registeredCall).resolves.toBeReceipt();
    expect(mockExternalContract.functionA).toHaveBeenCalledOnContract();
  });
});
