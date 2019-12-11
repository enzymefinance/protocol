pragma solidity ^0.5.13;


import "./ERC20Interface.sol";


interface ConversionRatesInterface {

    function recordImbalance(
        ERC20KyberClone token,
        int buyAmount,
        uint rateUpdateBlock,
        uint currentBlock
    )
        public;

    function getRate(ERC20KyberClone token, uint currentBlockNumber, bool buy, uint qty) public view returns(uint);
}
