import Web3 from "web3";
import * as masterConfig from "../config/environment";

const config = masterConfig[process.env.CHAIN_ENV];
const providerUrl = `http://${config.host}:${config.port}`;

// Prepend http if development node
const provider = new Web3.providers.HttpProvider(providerUrl);
const web3 = new Web3(provider);

web3.extend({
  property: "evm",
  methods: [
    {
      name: "mine",
      call: "evm_mine",
      params: 0,
    },
    {
      name: "increaseTime",
      call: "evm_increaseTime",
      params: 1,
    },
  ],
});

export async function resetProvider(web3Object, newProviderUrl) {
  const newProvider = new Web3.providers.HttpProvider(newProviderUrl);
  return web3.setProvider(newProvider);
}

export default web3;
