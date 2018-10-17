import { getAbi } from '~/utils/abi';

export const getPolicyManagerABI = () =>
  getAbi('fund/policies/PolicyManager.abi');
