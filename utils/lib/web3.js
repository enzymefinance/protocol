import Web3 from "web3";
import * as masterConfig from "../config/environment";

const config = masterConfig[process.env.CHAIN_ENV];

let providerUrl = `${config.host}:${config.port}`;

// Prepend http if development node
if (process.env.CHAIN_ENV !== "kovanHosted") providerUrl = `http://${  providerUrl}`;
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

export default web3;
