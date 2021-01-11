// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../../interfaces/IMakerDaoPot.sol";
import "../IDerivativePriceFeed.sol";

/// @title ChaiPriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price source oracle for Chai
contract ChaiPriceFeed is IDerivativePriceFeed {
    using SafeMath for uint256;

    uint256 private constant CHI_DIVISOR = 10**27;
    address private immutable CHAI;
    address private immutable DAI;
    address private immutable DSR_POT;

    constructor(
        address _chai,
        address _dai,
        address _dsrPot
    ) public {
        CHAI = _chai;
        DAI = _dai;
        DSR_POT = _dsrPot;
    }

    /// @notice Converts a given amount of a derivative to its underlying asset values
    /// @param _derivative The derivative to convert
    /// @param _derivativeAmount The amount of the derivative to convert
    /// @return underlyings_ The underlying assets for the _derivative
    /// @return underlyingAmounts_ The amount of each underlying asset for the equivalent derivative amount
    /// @dev Calculation based on Chai source: https://github.com/dapphub/chai/blob/master/src/chai.sol
    function calcUnderlyingValues(address _derivative, uint256 _derivativeAmount)
        external
        override
        returns (address[] memory underlyings_, uint256[] memory underlyingAmounts_)
    {
        require(isSupportedAsset(_derivative), "calcUnderlyingValues: Only Chai is supported");

        underlyings_ = new address[](1);
        underlyings_[0] = DAI;
        underlyingAmounts_ = new uint256[](1);
        underlyingAmounts_[0] = _derivativeAmount.mul(IMakerDaoPot(DSR_POT).chi()).div(
            CHI_DIVISOR
        );
    }

    /// @notice Checks if an asset is supported by the price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is supported
    function isSupportedAsset(address _asset) public view override returns (bool isSupported_) {
        return _asset == CHAI;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `CHAI` variable value
    /// @return chai_ The `CHAI` variable value
    function getChai() external view returns (address chai_) {
        return CHAI;
    }

    /// @notice Gets the `DAI` variable value
    /// @return dai_ The `DAI` variable value
    function getDai() external view returns (address dai_) {
        return DAI;
    }

    /// @notice Gets the `DSR_POT` variable value
    /// @return dsrPot_ The `DSR_POT` variable value
    function getDsrPot() external view returns (address dsrPot_) {
        return DSR_POT;
    }
}
