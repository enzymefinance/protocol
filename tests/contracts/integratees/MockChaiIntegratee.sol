// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../PreminedToken.sol";
import "./utils/MockIntegrateeBase.sol";

contract MockChaiIntegratee is MockIntegrateeBase, PreminedToken("Chai", "CHAI", 18) {
    address public dai;

    constructor(address _dai)
        public
        MockIntegrateeBase(new address[](0), new address[](0), new uint8[](0), 18)
    {
        dai = _dai;
    }

    function join(address payable _trader, uint256 _daiAmount) external {
        __getRateAndSwapAssets(_trader, dai, _daiAmount, address(this));
    }

    function exit(address payable _trader, uint256 _chaiAmount) external {
        __getRateAndSwapAssets(_trader, address(this), _chaiAmount, dai);
    }
}
