import {deployContract} from "../../lib/contracts";

async function deploy(environment, accounts=[], previous={}) {
  const deployed = {};
  const opts = Object.freeze({from: accounts[0], gas: 1000000});
  switch (environment) {
    case 'development':
    deployed.SimpleMarket = await deployContract("exchange/thirdparty/SimpleMarket", opts);
    deployed.SimpleAdapter = await deployContract("exchange/adapter/SimpleAdapter", opts);
    deployed.MatchingMarket = await deployContract("exchange/thirdparty/MatchingMarket", opts, [999999999999]);
    deployed.MatchingMarketAdapter = await deployContract("exchange/adapter/MatchingMarketAdapter", opts);
      break;
    case 'kovan-demo':
      deployed.MatchingMarket = await deployContract("exchange/thirdparty/MatchingMarket", opts, [999999999999]);
      deployed.MatchingMarketAdapter = await deployContract("exchange/adapter/MatchingMarketAdapter", opts);
      deployed.ZeroExTokenTransferProxy = await deployContract(
        "exchange/thirdparty/0x/TokenTransferProxy", opts
      );
      deployed.ZeroExExchange = await deployContract("exchange/thirdparty/0x/Exchange", opts,
        [ "0x0", deployed.ZeroExTokenTransferProxy.address ]
      );
      deployed.ZeroExV1Adapter = await deployContract("exchange/adapter/ZeroExV1Adapter", opts);
      await deployed.ZeroExTokenTransferProxy.instance.addAuthorizedAddress.postTransaction(
        opts, [ deployed.ZeroExExchange.address ]
      );
      break;
    case 'kovan-competition':
      break;
    case 'live-competition':
      break;
  }
  return deployed;
}

export default deploy;

