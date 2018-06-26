import Web3 from "web3";
import * as masterConfig from "../config/environment";

const config = masterConfig[process.env.CHAIN_ENV];
const provider = new Web3.providers.HttpProvider(`http://${config.host}:${config.port}`)
const web3 = new Web3(provider);

export default web3;
