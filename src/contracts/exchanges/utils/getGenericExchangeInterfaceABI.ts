import getABI from '~/utils/abi/getABI';

const getGenericExchangeInterfaceABI = () =>
  getABI('exchanges/GenericExchangeInterface.abi');

export default getGenericExchangeInterfaceABI;
