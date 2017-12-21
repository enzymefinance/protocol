// @flow
import Api from "@parity/api";
import * as instances from "./instances";

const BigNumber = require('bignumber.js');
const environmentConfig = require("../config/environment.js");

const environment = "development";
const config = environmentConfig[environment];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

async function getAllBalances(accounts, fund) {

  const deployer = accounts[0];
  const manager = accounts[1];
  const investor = accounts[2];
  const worker = accounts[3];

  return {
    investor: {
      mlnToken: Number(
        await instances.mlnToken.instance.balanceOf.call({}, [investor]),
      ),
      ethToken: Number(
        await instances.ethToken.instance.balanceOf.call({}, [investor]),
      ),
      ether: new BigNumber(await api.eth.getBalance(investor)),
    },
    manager: {
      mlnToken: Number(await instances.mlnToken.instance.balanceOf.call({}, [manager])),
      ethToken: Number(await instances.ethToken.instance.balanceOf.call({}, [manager])),
      ether: new BigNumber(await api.eth.getBalance(manager)),
    },
    fund: {
      mlnToken: Number(
        await instances.mlnToken.instance.balanceOf.call({}, [fund.address]),
      ),
      ethToken: Number(
        await instances.ethToken.instance.balanceOf.call({}, [fund.address]),
      ),
      ether: new BigNumber(await api.eth.getBalance(fund.address)),
    },
    worker: {
      mlnToken: Number(await instances.mlnToken.instance.balanceOf.call({}, [worker])),
      ethToken: Number(await instances.ethToken.instance.balanceOf.call({}, [worker])),
      ether: new BigNumber(await api.eth.getBalance(worker)),
    },
    deployer: {
      mlnToken: Number(
        await instances.mlnToken.instance.balanceOf.call({}, [deployer]),
      ),
      ethToken: Number(
        await instances.ethToken.instance.balanceOf.call({}, [deployer]),
      ),
      ether: new BigNumber(await api.eth.getBalance(deployer)),
    },
  };
}

export default getAllBalances;
