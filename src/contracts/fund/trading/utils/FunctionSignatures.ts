import { getFunctionSignature } from '~/utils/abi/getFunctionSignature';
import { requireMap, Contracts } from '~/Contracts';

const adapterABI = requireMap[Contracts.ExchangeAdapter];
const participationABI = requireMap[Contracts.Participation];

export enum FunctionSignatures {
  makeOrder = getFunctionSignature(adapterABI, 'makeOrder'),
  takeOrder = getFunctionSignature(adapterABI, 'takeOrder'),
  cancelOrder = getFunctionSignature(adapterABI, 'cancelOrder'),
  executeRequestFor = getFunctionSignature(
    participationABI,
    'executeRequestFor',
  ),
}
