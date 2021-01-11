// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../prices/CentralizedRateProvider.sol";
import "../tokens/MockToken.sol";
import "../utils/SwapperBase.sol";

contract MockChaiIntegratee is MockToken, SwapperBase {
    address private immutable CENTRALIZED_RATE_PROVIDER;
    address public immutable DAI;

    constructor(
        address _dai,
        address _centralizedRateProvider,
        uint8 _decimals
    ) public MockToken("Chai", "CHAI", _decimals) {
        _setupDecimals(_decimals);
        CENTRALIZED_RATE_PROVIDER = _centralizedRateProvider;
        DAI = _dai;
    }

    function join(address, uint256 _daiAmount) external {
        uint256 tokenDecimals = ERC20(DAI).decimals();
        uint256 chaiDecimals = decimals();

        // Calculate the amount of tokens per one unit of DAI
        uint256 daiPerChaiUnit = CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValue(address(this), 10**uint256(chaiDecimals), DAI);

        // Calculate the inverse rate to know the amount of CHAI to return from a unit of DAI
        uint256 inverseRate = uint256(10**tokenDecimals).mul(10**uint256(chaiDecimals)).div(
            daiPerChaiUnit
        );
        // Mint and send those CHAI to sender
        uint256 destAmount = _daiAmount.mul(inverseRate).div(10**tokenDecimals);
        _mint(address(this), destAmount);
        __swapAssets(msg.sender, DAI, _daiAmount, address(this), destAmount);
    }

    function exit(address payable _trader, uint256 _chaiAmount) external {
        uint256 destAmount = CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER).calcLiveAssetValue(
            address(this),
            _chaiAmount,
            DAI
        );
        // Burn CHAI of the trader.
        _burn(_trader, _chaiAmount);
        // Release DAI to the trader.
        ERC20(DAI).transfer(msg.sender, destAmount);
    }
}
