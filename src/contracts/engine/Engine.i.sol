pragma solidity ^0.5.13;


interface IEngine {
    function payAmguInEther() external payable;
    function getAmguPrice() external view returns (uint256);
}
