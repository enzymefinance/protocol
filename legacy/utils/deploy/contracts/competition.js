import web3 from "../../lib/web3";
import {deployContract} from "../../lib/contracts";
import getChainTime from "../../lib/getChainTime";

const BigNumber = require("bignumber.js");

async function deploy(environment, previous={}) {
  const deployed = {};
  const accounts = await web3.eth.getAccounts();
  const opts = Object.freeze({from: accounts[0], gas: 6000000});
  switch (environment) {
    case 'development':
      const blockchainTime = await getChainTime();
      deployed.Competition = await deployContract(
        "competitions/Competition",
        opts,
        [
          previous.MlnToken.options.address, previous.Version.options.address,
          accounts[5], blockchainTime, blockchainTime + 8640000,
          20 * 10 ** 18, new BigNumber(10 ** 23), 10
        ]
      );
      await previous.CompetitionCompliance.methods.changeCompetitionAddress(deployed.Competition.options.address).send(Object.assign({}, opts));
      await deployed.Competition.methods.batchAddToWhitelist(new BigNumber(10 ** 25), [accounts[0], accounts[1], accounts[2]]).send(Object.assign({}, opts));
      break;
    case 'kovan-demo':
      break;
    case 'kovan-competition':
      break;
    case 'live-competition':
      break;
  }
  return Object.assign(previous, deployed);
}

export default deploy;



