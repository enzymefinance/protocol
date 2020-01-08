pragma solidity 0.6.1;


/// @title Kyber Network interface
interface IKyberNetworkProxy {
    function maxGasPrice() external view returns(uint256);
    function getUserCapInWei(address) external view returns(uint256);
    function getUserCapInTokenWei(address, address) external view returns(uint256);
    function enabled() external view returns(bool);
    function info(bytes32) external view returns(uint256);
    function swapEtherToToken(address, uint256) external payable returns(uint256);
    function swapTokenToEther(address, uint256, uint256) external returns(uint256);
    function swapTokenToToken(address, uint256, address, uint256) external returns(uint);
    function getExpectedRate(address, address, uint256) external view returns (uint256, uint256);
    function tradeWithHint(
        address, uint256, address, address, uint256, uint256, address, bytes calldata
    ) external payable returns(uint256);
}
