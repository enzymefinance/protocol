// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IFundValueCalculator} from "../../fund-value-calculator/IFundValueCalculator.sol";
import {MultiCallAccountMixin} from "../utils/MultiCallAccountMixin.sol";
import {ISharePriceThrottledAssetManagerLib} from "./ISharePriceThrottledAssetManagerLib.sol";

/// @title SharePriceThrottledAssetManagerLib Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice A smart account that throttles the signer's atomic value loss to a fund,
/// by tracking cumulative atomic losses to the fund's share price over a rolling duration
/// @dev Share price loss is tracked:
/// - cumulatively (additive between subsequent txs)
/// - relatively (as a percentage)
/// - with a replenishing tolerance (based on time since last loss)
/// This contract is version-agnostic, so long as the FundValueCalculatorRouter supports the fund's current version.
/// Note that the FundValueCalculatorRouter is meant mostly for off-chain consumption (due to gas costs),
/// but its gross share value functions are gas-efficient
contract SharePriceThrottledAssetManagerLib is ISharePriceThrottledAssetManagerLib, MultiCallAccountMixin {
    event Initialized(
        address indexed vaultProxy, uint64 lossTolerance, uint32 lossTolerancePeriodDuration, address indexed shutDowner
    );

    event ThrottleUpdated(uint256 nextCumulativeLoss);

    error AlreadyInitialized();

    error ExceedsOneHundredPercent();

    error ToleranceExceeded(uint256 cumulativeLoss);

    uint256 private constant ONE_HUNDRED_PERCENT = 1e18;
    IFundValueCalculator private immutable FUND_VALUE_CALCULATOR_ROUTER;

    // `shutdowner`: an admin who can shut down the smart account
    address private shutdowner;
    // `vaultProxyAddress`: the VaultProxy whose share price will be used for throttling
    address private vaultProxyAddress;
    // `lossTolerance`: the maximum cumulative percentage loss tolerated,
    // see `ONE_HUNDRED_PERCENT` for precision
    uint64 private lossTolerance;
    // `lossTolerancePeriodDuration`: the number of seconds over which a `throttle` that has
    // fully reached `LOSS_TOLERANCE` will reset to 0. This dictates the rate of replenishment
    // of the throttle.
    uint32 private lossTolerancePeriodDuration;

    // `Throttle`: the cumulative loss info
    Throttle private throttle;

    constructor(
        address _addressListRegistry,
        uint256 _gsnTrustedForwardersAddressListId,
        IFundValueCalculator _fundValueCalculatorRouter
    ) MultiCallAccountMixin(_addressListRegistry, _gsnTrustedForwardersAddressListId) {
        FUND_VALUE_CALCULATOR_ROUTER = _fundValueCalculatorRouter;
    }

    /// @dev Pseudo-constructor to be called upon proxy deployment
    function init(
        address _owner,
        address _vaultProxyAddress,
        uint64 _lossTolerance,
        uint32 _lossTolerancePeriodDuration,
        address _shutdowner
    ) external override {
        if (getVaultProxyAddress() != address(0)) {
            revert AlreadyInitialized();
        }

        if (_lossTolerance > ONE_HUNDRED_PERCENT) {
            revert ExceedsOneHundredPercent();
        }

        __setOwner(_owner);

        vaultProxyAddress = _vaultProxyAddress;
        lossTolerance = _lossTolerance;
        lossTolerancePeriodDuration = _lossTolerancePeriodDuration;
        shutdowner = _shutdowner;

        emit Initialized(_vaultProxyAddress, _lossTolerance, _lossTolerancePeriodDuration, _shutdowner);
    }

    /// @inheritdoc MultiCallAccountMixin
    function executeCalls(Call[] calldata _calls) public override {
        uint256 prevSharePrice = __getSharePrice();

        super.executeCalls(_calls);

        __validateAndUpdateThrottle({_prevSharePrice: prevSharePrice});
    }

    /// @notice Shuts down the smart account
    function shutdown() external {
        if (__msgSender() != getShutdowner()) {
            revert Unauthorized();
        }

        __setOwner(address(0));
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to get the gross share price for the fund.
    /// The quote asset is irrelevant, as the relative loss is what is tracked.
    function __getSharePrice() private returns (uint256 sharePrice_) {
        (, sharePrice_) = FUND_VALUE_CALCULATOR_ROUTER.calcGrossShareValue({_vaultProxy: getVaultProxyAddress()});
    }

    /// @dev Helper to update the throttle with any current loss,
    /// and validate that its tolerance has not been breached
    function __validateAndUpdateThrottle(uint256 _prevSharePrice) private {
        uint256 currentSharePrice = __getSharePrice();
        if (currentSharePrice >= _prevSharePrice) {
            return;
        }

        uint256 nextCumulativeLoss = throttle.cumulativeLoss;

        // Replenish tolerated loss, given the previous loss timestamp
        if (nextCumulativeLoss > 0) {
            uint256 cumulativeLossToRestore =
                getLossTolerance() * (block.timestamp - throttle.lastLossTimestamp) / getLossTolerancePeriodDuration();
            if (cumulativeLossToRestore < nextCumulativeLoss) {
                nextCumulativeLoss -= cumulativeLossToRestore;
            } else {
                nextCumulativeLoss = 0;
            }
        }

        // Add the new loss
        uint256 newLoss = ONE_HUNDRED_PERCENT * (_prevSharePrice - currentSharePrice) / _prevSharePrice;
        nextCumulativeLoss += newLoss;

        // Validate that the new cumulative loss is within the tolerance
        if (nextCumulativeLoss > getLossTolerance()) {
            revert ToleranceExceeded(nextCumulativeLoss);
        }

        // Update the throttle
        throttle.cumulativeLoss = uint64(nextCumulativeLoss);
        throttle.lastLossTimestamp = uint64(block.timestamp);

        emit ThrottleUpdated(nextCumulativeLoss);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Get the cumulative loss tolerance percentage that is used for the throttle
    /// @return lossTolerance_ The loss tolerance percentage
    function getLossTolerance() public view returns (uint256 lossTolerance_) {
        return lossTolerance;
    }

    /// @notice Get the duration of the period governing the throttle
    /// @return lossTolerancePeriodDuration_ The duration in seconds
    function getLossTolerancePeriodDuration() public view returns (uint256 lossTolerancePeriodDuration_) {
        return lossTolerancePeriodDuration;
    }

    /// @notice Gets the user who can shutdown the smart account
    /// @return shutdowner_ The user who can shutdown the smart account
    function getShutdowner() public view returns (address shutdowner_) {
        return shutdowner;
    }

    /// @notice Get the latest throttle info
    /// @return throttle_ The throttle info
    function getThrottle() public view returns (Throttle memory throttle_) {
        return throttle;
    }

    /// @notice Get the VaultProxy used to throttle share price
    /// @return vaultProxyAddress_ The VaultProxy address
    function getVaultProxyAddress() public view returns (address vaultProxyAddress_) {
        return vaultProxyAddress;
    }
}
