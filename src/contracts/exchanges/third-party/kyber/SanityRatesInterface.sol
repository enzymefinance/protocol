pragma solidity ^0.4.25;


import "./ERC20Interface.sol";

interface SanityRatesInterface {
    function getSanityRate(ERC20KyberClone src, ERC20KyberClone dest) public view returns(uint);
}
