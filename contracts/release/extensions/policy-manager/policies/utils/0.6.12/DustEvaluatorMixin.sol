// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../utils/0.6.12/FundDeployerOwnerMixin.sol";

/// @title DustEvaluatorMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A mixin used to evaluate where an amount of a given asset can be considered "dust,"
/// i.e., of negligible value
abstract contract DustEvaluatorMixin is FundDeployerOwnerMixin {
    event DustToleranceInWethSet(uint256 nextDustToleranceInWeth);

    uint256 private dustToleranceInWeth;

    constructor(address _fundDeployer) public FundDeployerOwnerMixin(_fundDeployer) {}

    /// @notice Sets the dustToleranceInWeth variable value
    /// @param _nextDustToleranceInWeth The next dustToleranceInWeth value
    function setDustToleranceInWeth(uint256 _nextDustToleranceInWeth) external onlyFundDeployerOwner {
        dustToleranceInWeth = _nextDustToleranceInWeth;

        emit DustToleranceInWethSet(_nextDustToleranceInWeth);
    }

    /// @dev Helper to evaluate whether an amount of WETH is dust
    function __isDust(uint256 _wethAmount) internal view returns (bool isDust_) {
        return _wethAmount <= getDustToleranceInWeth();
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `dustToleranceInWeth` variable
    /// @return dustToleranceInWeth_ The `dustToleranceInWeth` variable value
    function getDustToleranceInWeth() public view returns (uint256 dustToleranceInWeth_) {
        return dustToleranceInWeth;
    }
}
