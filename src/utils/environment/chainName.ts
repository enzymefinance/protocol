const chainMap = {
  1: 'mainnet',
  42: 'kovan',
};

export const getChainName = async environment => {
  const chainId = await environment.eth.net.getId();
  return chainMap[chainId] || 'development';
};
