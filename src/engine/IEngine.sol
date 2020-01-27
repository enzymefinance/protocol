pragma solidity 0.6.1;


interface IEngine {
    function payIncentiveInEther() external payable;
    function payAmguInEther() external payable;
    function getAmguPrice() external view returns (uint256);
}
