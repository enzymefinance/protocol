import { getFunctionSignature } from '~/utils/abi/getFunctionSignature';
import { requireMap, Contracts } from '~/Contracts';

const adapterABI = requireMap[Contracts.ExchangeAdapter];
const ethfinexAdapterABI = requireMap[Contracts.EthfinexAdapter];
const participationABI = requireMap[Contracts.Participation];

export enum FunctionSignatures {
  makeOrder = getFunctionSignature(adapterABI, 'makeOrder'),
  takeOrder = getFunctionSignature(adapterABI, 'takeOrder'),
  cancelOrder = getFunctionSignature(adapterABI, 'cancelOrder'),
  withdrawTokens = getFunctionSignature(ethfinexAdapterABI, 'withdrawTokens'),
  executeRequestFor = getFunctionSignature(
    participationABI,
    'executeRequestFor',
  ),
  requestInvestment = getFunctionSignature(
    participationABI,
    'requestInvestment',
  ),
}
