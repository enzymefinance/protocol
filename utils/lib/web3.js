import Web3 from "web3";
import * as masterConfig from "../config/environment";

const config = masterConfig[process.env.CHAIN_ENV];
const provider = new Web3.providers.HttpProvider(`http://${config.host}:${config.port}`)
const web3 = new Web3(provider);

web3.extend({
    property: 'evm',
    methods: [
        {
            name: 'mine',
            call: 'evm_mine',
            params: 0
        },
       {
         name: 'increaseTime',
         call: 'evm_increaseTime',
         params: 1
       }
    ]
});

export default web3;
