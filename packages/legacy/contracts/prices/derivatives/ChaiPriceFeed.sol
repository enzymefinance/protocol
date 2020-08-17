// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./IDerivativePriceSource.sol";

/// @title ChaiPriceFeed Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Price source oracle for Chai
contract ChaiPriceFeed is IDerivativePriceSource {
    using SafeMath for uint256;

    address public immutable CHAI;
    address public immutable DAI;
    address public immutable DSR_POT;

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
    /// @return rates_ The rates for the _derivative to the _underlyings
    function getRatesToUnderlyings(address _derivative)
        external
        override
        returns (address[] memory underlyings_, uint256[] memory rates_)
    {
        require(_derivative == CHAI, "getRatesToUnderlyings: only Chai is supported");

        underlyings_ = new address[](1);
        underlyings_[0] = DAI;
        rates_ = new uint256[](1);
        rates_[0] = __calcChaiRate();
    }

    /// @dev Calculation based on Chai source: https://github.com/dapphub/chai/blob/master/src/chai.sol
    function __calcChaiRate() private returns (uint256) {
        IPot pot = IPot(DSR_POT);
        uint256 chi = (now > pot.rho()) ? pot.drip() : pot.chi();
        return chi.div(10**9); // Refactor of mul(chi, 10 ** 18) / 10 ** 27
    }
}

/// @notice Limited interface for Maker DSR's Pot contract
/// @dev See DSR integration guide: https://github.com/makerdao/developerguides/blob/master/dai/dsr-integration-guide/dsr-integration-guide-01.md
interface IPot {
    function chi() external view returns (uint256);

    function rho() external view returns (uint256);

    function drip() external returns (uint256);
}
