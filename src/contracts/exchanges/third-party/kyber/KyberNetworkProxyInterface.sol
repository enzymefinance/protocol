pragma solidity ^0.5.13;


import "./ERC20Interface.sol";


/// @title Kyber Network interface
interface KyberNetworkProxyInterface {
    function maxGasPrice() external view returns(uint);
    function getUserCapInWei(address user) external view returns(uint);
    function getUserCapInTokenWei(address user, ERC20KyberClone token) external view returns(uint);
    function enabled() external view returns(bool);
    function info(bytes32 id) external view returns(uint);
    function swapEtherToToken(ERC20KyberClone token, uint minConversionRate) external payable returns(uint);
    function swapTokenToEther(ERC20KyberClone token, uint srcAmount, uint minConversionRate) external returns(uint);
    function swapTokenToToken(ERC20KyberClone src, uint srcAmount, ERC20KyberClone dest, uint minConversionRate) external returns(uint);

    function getExpectedRate(ERC20KyberClone src, ERC20KyberClone dest, uint srcQty) external view
        returns (uint expectedRate, uint slippageRate);

    function tradeWithHint(ERC20KyberClone src, uint srcAmount, ERC20KyberClone dest, address destAddress, uint maxDestAmount,
        uint minConversionRate, address walletId, bytes calldata hint) external payable returns(uint);
}
