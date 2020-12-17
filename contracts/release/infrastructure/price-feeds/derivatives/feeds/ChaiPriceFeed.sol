// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../../interfaces/IMakerDaoPot.sol";
import "../IDerivativePriceFeed.sol";

/// @title ChaiPriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price source oracle for Chai
contract ChaiPriceFeed is IDerivativePriceFeed {
    using SafeMath for uint256;

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

    /// @notice Gets the rates for 1 unit of the derivative to its underlying assets
    /// @param _derivative The derivative for which to get the rates
    /// @return underlyings_ The underlying assets for the _derivative
    /// @return rates_ The rates for the _derivative to the underlyings_
    function getRatesToUnderlyings(address _derivative)
        external
        override
        returns (address[] memory underlyings_, uint256[] memory rates_)
    {
        require(isSupportedAsset(_derivative), "getRatesToUnderlyings: Only Chai is supported");

        underlyings_ = new address[](1);
        underlyings_[0] = DAI;
        rates_ = new uint256[](1);
        rates_[0] = __calcChaiRate();
    }

    /// @notice Checks if an asset is supported by the price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is supported
    function isSupportedAsset(address _asset) public view override returns (bool isSupported_) {
        return _asset == CHAI;
    }

    /// @dev Calculation based on Chai source: https://github.com/dapphub/chai/blob/master/src/chai.sol
    function __calcChaiRate() private view returns (uint256 chaiRate_) {
        return IMakerDaoPot(DSR_POT).chi().div(10**9);
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
