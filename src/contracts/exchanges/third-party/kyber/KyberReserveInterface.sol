pragma solidity ^0.5.13;


import "./ERC20Interface.sol";

/// @title Kyber Reserve contract
interface KyberReserveInterface {

    function trade(
        ERC20KyberClone srcToken,
        uint srcAmount,
        ERC20KyberClone destToken,
        address destAddress,
        uint conversionRate,
        bool validate
    )
        public
        payable
        returns(bool);

    function getConversionRate(ERC20KyberClone src, ERC20KyberClone dest, uint srcQty, uint blockNumber) public view returns(uint);
}
