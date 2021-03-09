import { Call, Contract, contract } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  callOnIntegrationArgs,
  AlphaHomoraV1Adapter,
  alphaHomoraV1LendArgs,
  alphaHomoraV1RedeemArgs,
  ComptrollerLib,
  IntegrationManager,
  IntegrationManagerActionId,
  lendSelector,
  redeemSelector,
} from '@enzymefinance/protocol';
import { BigNumber, BigNumberish, providers, utils } from 'ethers';

export interface AlphaHomoraV1BankConfig extends Contract<AlphaHomoraV1BankConfig> {
  getReservePoolBps: Call<() => BigNumber, Contract<any>>;
}

export const AlphaHomoraV1BankConfig = contract<AlphaHomoraV1BankConfig>()`
  function getReservePoolBps() view returns (uint256)
`;

export interface AlphaHomoraV1Bank extends Contract<AlphaHomoraV1Bank> {
  config: Call<() => string, Contract<any>>;
  glbDebtVal: Call<() => BigNumber, Contract<any>>;
  pendingInterest: Call<(msgValue: BigNumberish) => BigNumber, Contract<any>>;
  reservePool: Call<() => BigNumber, Contract<any>>;
  totalEth: Call<() => BigNumber, Contract<any>>;
}

export const AlphaHomoraV1Bank = contract<AlphaHomoraV1Bank>()`
  function config() view returns (address)
  function glbDebtVal() view returns (uint256)
  function pendingInterest(uint256) view returns (uint256)
  function reservePool() view returns (uint256)
  function totalEth() view returns (uint256)
`;

export async function alphaHomoraV1Lend({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  alphaHomoraV1Adapter,
  wethAmount = utils.parseEther('1'),
  minibethAmount = 1,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  alphaHomoraV1Adapter: AlphaHomoraV1Adapter;
  wethAmount?: BigNumberish;
  minibethAmount?: BigNumberish;
}) {
  const lendArgs = alphaHomoraV1LendArgs({
    outgoingWethAmount: wethAmount,
    minIncomingIbethAmount: minibethAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: alphaHomoraV1Adapter,
    selector: lendSelector,
    encodedCallArgs: lendArgs,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function alphaHomoraV1Redeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  alphaHomoraV1Adapter,
  ibethAmount = utils.parseEther('1'),
  minWethAmount = 1,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  alphaHomoraV1Adapter: AlphaHomoraV1Adapter;
  ibethAmount?: BigNumberish;
  minWethAmount?: BigNumberish;
}) {
  const redeemArgs = alphaHomoraV1RedeemArgs({
    outgoingIbethAmount: ibethAmount,
    minIncomingWethAmount: minWethAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: alphaHomoraV1Adapter,
    selector: redeemSelector,
    encodedCallArgs: redeemArgs,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function calcAlphaBankLiveTotalEth({
  provider,
  alphaHomoraBank,
}: {
  provider: providers.Provider;
  alphaHomoraBank: AlphaHomoraV1Bank;
}) {
  const pendingInterest = await alphaHomoraBank.pendingInterest(0);
  const glbDebtVal = (await alphaHomoraBank.glbDebtVal()).add(pendingInterest);

  const bankConfig = new AlphaHomoraV1BankConfig(await alphaHomoraBank.config(), provider);
  const toReserveAmount = pendingInterest.mul(await bankConfig.getReservePoolBps()).div(10000);
  const reservePool = (await alphaHomoraBank.reservePool()).add(toReserveAmount);

  const bankEthBalance = await provider.getBalance(alphaHomoraBank.address);

  return bankEthBalance.add(glbDebtVal).sub(reservePool);
}
