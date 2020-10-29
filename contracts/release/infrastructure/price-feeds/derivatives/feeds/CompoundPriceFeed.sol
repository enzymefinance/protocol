// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../../../interfaces/ICERC20.sol";
import "../../../../utils/MathHelpers.sol";
import "../IDerivativePriceFeed.sol";

/// @title CompoundPriceFeed Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Price source oracle for Compound Tokens (cTokens)
contract CompoundPriceFeed is IDerivativePriceFeed {
    using SafeMath for uint256;

    address private immutable WETH;
    address private immutable CETH;

    constructor(address _weth, address _ceth) public {
        WETH = _weth;
        CETH = _ceth;
    }

    /// @notice Gets the rates for 1 unit of the derivative to its underlying assets
    /// @param _derivative The derivative for which to get the rates
    /// @return underlyings_ The underlying assets for the _derivative
    /// @return rates_ The rates for the _derivative to the underlyings_
    function getRatesToUnderlyings(address _derivative)
        external
        override
        returns (address[] memory underlyings_, uint256[] memory rates_)
    {
        underlyings_ = new address[](1);
        if (_derivative == CETH) {
            underlyings_[0] = WETH;
        } else {
            underlyings_[0] = ICERC20(_derivative).underlying();
        }

        rates_ = new uint256[](1);
        rates_[0] = ICERC20(_derivative).exchangeRateStored();
    }

    /// @notice Check if an asset is supported by the price feed
    /// @dev Currently unused
    function isSupportedAsset(address) external view override returns (bool) {
        return true;
    }
}
