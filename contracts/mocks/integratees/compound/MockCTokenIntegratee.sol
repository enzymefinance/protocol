// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "./MockCTokenBase.sol";

contract MockCTokenIntegratee is MockCTokenBase {
    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        address _token,
        address _centralizedRateProvider,
        uint256 _initialRate
    )
        public
        MockCTokenBase(_name, _symbol, _decimals, _token, _centralizedRateProvider, _initialRate)
    {}

    function mint(uint256 _amount) external returns (uint256) {
        uint256 destAmount = __calcCTokenAmount(_amount);
        __swapAssets(msg.sender, TOKEN, _amount, address(this), destAmount);
        return _amount;
    }

    function redeem(uint256 _amount) external returns (uint256) {
        uint256 destAmount = CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER).calcLiveAssetValue(
            address(this),
            _amount,
            TOKEN
        );
        __swapAssets(msg.sender, address(this), _amount, TOKEN, destAmount);
        return _amount;
    }
}
