pragma solidity ^0.5.13;


import "./ERC20Interface.sol";

interface SanityRatesInterface {
    function getSanityRate(ERC20KyberClone src, ERC20KyberClone dest) public view returns(uint);
}
