// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../PreminedToken.sol";
import "./utils/SimpleMockIntegrateeBase.sol";

contract MockChaiIntegratee is SimpleMockIntegrateeBase {
    address public immutable DAI;
    address public immutable CHAI;

    constructor(address _chai, address _dai)
        public
        SimpleMockIntegrateeBase(new address[](0), new address[](0), new uint8[](0), 18)
    {
        DAI = _dai;
        CHAI = _chai;
    }

    function join(address payable _trader, uint256 _daiAmount) external {
        __getRateAndSwapAssets(_trader, DAI, _daiAmount, CHAI);
    }

    function exit(address payable _trader, uint256 _chaiAmount) external {
        __getRateAndSwapAssets(_trader, CHAI, _chaiAmount, DAI);
    }
}
