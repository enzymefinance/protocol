pragma solidity ^0.5.13;


import "./ERC20Interface.sol";


interface ExpectedRateInterface {
    function getExpectedRate(ERC20KyberClone src, ERC20KyberClone dest, uint srcQty, bool usePermissionless) public view
        returns (uint expectedRate, uint slippageRate);
}
