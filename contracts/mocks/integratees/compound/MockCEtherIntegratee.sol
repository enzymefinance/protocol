// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./MockCTokenBase.sol";

contract MockCEtherIntegratee is MockCTokenBase {
    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        address _weth,
        address _centralizedRateProvider,
        uint256 _initialRate
    )
        public
        MockCTokenBase(_name, _symbol, _decimals, _weth, _centralizedRateProvider, _initialRate)
    {}

    function mint() external payable {
        uint256 amount = msg.value;
        uint256 destAmount = __calcCTokenAmount(amount);
        __swapAssets(msg.sender, ETH_ADDRESS, amount, address(this), destAmount);
    }

    function redeem(uint256 _amount) external returns (uint256) {
        uint256 destAmount = CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER).calcLiveAssetValue(
            address(this),
            _amount,
            TOKEN
        );
        __swapAssets(msg.sender, address(this), _amount, ETH_ADDRESS, destAmount);
        return _amount;
    }
}
