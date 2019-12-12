pragma solidity ^0.5.13;


import "./ERC20Interface.sol";


/// @title Kyber Network interface
interface KyberNetworkInterface {
    function maxGasPrice() external view returns(uint);
    function getUserCapInWei(address user) external view returns(uint);
    function getUserCapInTokenWei(address user, ERC20KyberClone token) external view returns(uint);
    function enabled() external view returns(bool);
    function info(bytes32 id) external view returns(uint);

    function getExpectedRate(ERC20KyberClone src, ERC20KyberClone dest, uint srcQty) external view
        returns (uint expectedRate, uint slippageRate);

    function tradeWithHint(address trader, ERC20KyberClone src, uint srcAmount, ERC20KyberClone dest, address destAddress,
        uint maxDestAmount, uint minConversionRate, address walletId, bytes calldata hint) external payable returns(uint);
}
