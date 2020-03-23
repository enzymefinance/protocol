pragma solidity 0.6.4;

interface IEngine {
    function getAmguPrice() external view returns (uint256);
    function payAmguInEther() external payable;
    function sellAndBurnMln(uint256) external;
}
