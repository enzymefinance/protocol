import { getAbi } from '~/utils/abi';

export const getGenericExchangeInterfaceABI = () =>
  getAbi('exchanges/GenericExchangeInterface.abi');
