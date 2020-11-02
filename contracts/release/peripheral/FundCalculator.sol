// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../core/fund/comptroller/IComptroller.sol";

/// @title FundCalculator Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Logic related to fund accounting not necessary in the core protocol
/// @dev This is currently only consumed off-chain, for informational purposes
contract FundCalculator {
    address private immutable FEE_MANAGER;

    constructor(address _feeManager) public {
        FEE_MANAGER = _feeManager;
    }

    /// @notice Calculates the net value of 1 unit of shares in the fund's denomination asset
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @return netShareValue_ The amount of the denomination asset per share
    /// @return isValid_ True if the conversion rates to derive the value are all valid
    /// @dev Accounts for fees outstanding. This is a convenience function for external consumption
    /// that can be used to determine the cost of purchasing shares at any given point in time.
    /// It essentially just bundles settling all fees that implement the Continuous hook and then
    /// looking up the gross share value.
    function calcNetShareValue(address _comptrollerProxy)
        external
        returns (uint256 netShareValue_, bool isValid_)
    {
        IComptroller comptrollerProxyContract = IComptroller(_comptrollerProxy);
        comptrollerProxyContract.callOnExtension(FEE_MANAGER, 0, "");

        return comptrollerProxyContract.calcGrossShareValue();
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `FEE_MANAGER` variable
    /// @return feeManager_ The `FEE_MANAGER` variable value
    function getFeeManager() external view returns (address feeManager_) {
        return FEE_MANAGER;
    }
}
