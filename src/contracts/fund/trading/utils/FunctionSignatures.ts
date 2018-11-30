import { getFunctionTextSignature } from '~/utils/abi/getFunctionTextSignature';
import { requireMap, Contracts } from '~/Contracts';

const adapterABI = requireMap[Contracts.MockAdapter];

export enum FunctionSignatures {
  makeOrder = getFunctionTextSignature(adapterABI, 'makeOrder'),
  takeOrder = getFunctionTextSignature(adapterABI, 'takeOrder'),
  cancelOrder = getFunctionTextSignature(adapterABI, 'cancelOrder'),
}
