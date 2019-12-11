pragma solidity ^0.5.13;


import "./ERC20Interface.sol";


/// @title simple interface for Kyber Network
interface SimpleNetworkInterface {
    function swapTokenToToken(ERC20KyberClone src, uint srcAmount, ERC20KyberClone dest, uint minConversionRate) public returns(uint);
    function swapEtherToToken(ERC20KyberClone token, uint minConversionRate) public payable returns(uint);
    function swapTokenToEther(ERC20KyberClone token, uint srcAmount, uint minConversionRate) public returns(uint);
}
