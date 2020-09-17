// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "../../../core/fund/comptroller/ComptrollerLib.sol";
import "../../../core/fund/vault/VaultLib.sol";
import "./utils/ContinuousFeeBase.sol";

/// @title PerformanceFee Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Calculates the performance fee for a particular fund
contract PerformanceFee is ContinuousFeeBase {
    event ActivatedForFund(address indexed comptrollerProxy);

    event FundSettingsAdded(address indexed comptrollerProxy, uint256 rate, uint256 period);

    event PaidOut(address indexed comptrollerProxy);

    event PerformanceUpdated(
        address indexed comptrollerProxy,
        uint256 prevSharePrice,
        uint256 currentSharePrice,
        int256 sharesOutstandingDiff
    );

    struct FeeInfo {
        uint256 rate;
        uint256 period;
        uint256 activated;
        uint256 lastPaid;
        uint256 lastSharePrice;
    }

    uint256 private constant RATE_DIVISOR = 10**18;
    uint256 private constant SHARE_UNIT = 10**18;

    mapping(address => FeeInfo) private comptrollerProxyToFeeInfo;

    constructor(address _feeManager) public ContinuousFeeBase(_feeManager) {}

    // EXTERNAL FUNCTIONS

    function activateForFund(address _comptrollerProxy) external override onlyFeeManager {
        FeeInfo storage feeInfo = comptrollerProxyToFeeInfo[_comptrollerProxy];
        feeInfo.activated = now;
        feeInfo.lastSharePrice = SHARE_UNIT;

        emit ActivatedForFund(_comptrollerProxy);
    }

    /// @notice Add the initial fee settings for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the calling fund
    /// @param _settingsData Encoded settings to apply to the policy for a fund
    function addFundSettings(address _comptrollerProxy, bytes calldata _settingsData)
        external
        override
        onlyFeeManager
    {
        (uint256 feeRate, uint256 feePeriod) = abi.decode(_settingsData, (uint256, uint256));
        require(feeRate > 0, "addFundSettings: feeRate must be greater than 0");
        require(feePeriod > 0, "addFundSettings: feePeriod must be greater than 0");

        comptrollerProxyToFeeInfo[_comptrollerProxy] = FeeInfo({
            rate: feeRate,
            period: feePeriod,
            activated: 0,
            lastPaid: 0,
            lastSharePrice: 0
        });

        emit FundSettingsAdded(_comptrollerProxy, feeRate, feePeriod);
    }

    /// @notice Provides a constant string identifier for a fee
    /// @return identifier_ The identifier string
    function identifier() external override pure returns (string memory identifier_) {
        return "PERFORMANCE";
    }

    /// @notice Update fee state for fund, if payout is allowed
    /// @param _comptrollerProxy The ComptrollerProxy of the calling fund
    /// @return isPayable_ True if shares outstanding can be paid out
    function payout(address _comptrollerProxy)
        external
        override
        onlyFeeManager
        returns (bool isPayable_)
    {
        if (!payoutAllowed(_comptrollerProxy)) {
            return false;
        }

        // Must mark as paid out even if no shares are due
        comptrollerProxyToFeeInfo[_comptrollerProxy].lastPaid = now;
        emit PaidOut(_comptrollerProxy);

        return true;
    }

    /// @notice Settle the fee and reconcile shares due
    /// @param _comptrollerProxy The ComptrollerProxy of the calling fund
    /// @return settlementType_ The type of settlement
    /// @return (unused) The payer of shares due
    /// @return sharesDue_ The amount of shares due
    function settle(address _comptrollerProxy, bytes calldata)
        external
        override
        onlyFeeManager
        returns (
            IFeeManager.SettlementType settlementType_,
            address,
            uint256 sharesDue_
        )
    {
        ComptrollerLib comptrollerContract = ComptrollerLib(_comptrollerProxy);

        uint256 sharesSupply = VaultLib(comptrollerContract.getVaultProxy()).totalSupply();
        if (sharesSupply == 0) {
            return (IFeeManager.SettlementType.None, address(0), 0);
        }

        int256 settlementSharesDue = __settleAndUpdatePerformance(
            _comptrollerProxy,
            sharesSupply,
            comptrollerContract.calcGav()
        );
        if (settlementSharesDue == 0) {
            return (IFeeManager.SettlementType.None, address(0), 0);
        }

        if (settlementSharesDue > 0) {
            // Settle by minting shares outstanding for custody
            return (
                IFeeManager.SettlementType.MintSharesOutstanding,
                address(0),
                uint256(settlementSharesDue)
            );
        } else {
            // Settle by burning from shares outstanding from the VaultProxy's custody
            return (
                IFeeManager.SettlementType.BurnSharesOutstanding,
                address(0),
                uint256(-settlementSharesDue)
            );
        }
    }

    // PUBLIC FUNCTIONS

    /// @notice Checks whether the outstanding shares can be paid out
    /// @param _comptrollerProxy The ComptrollerProxy of the calling fund
    /// @return payoutAllowed_ True if the fee payment is due
    /// @dev Payout is allowed if fees have not yet been settled in an elapsed redemption period
    function payoutAllowed(address _comptrollerProxy) public view returns (bool payoutAllowed_) {
        FeeInfo memory feeInfo = comptrollerProxyToFeeInfo[_comptrollerProxy];
        uint256 period = feeInfo.period;

        uint256 timeSinceActivated = now.sub(feeInfo.activated);

        // Check if at least 1 period has passed since activation
        if (timeSinceActivated < period) {
            return false;
        }

        // Check if a full period has passed since the last payout period
        uint256 timeSincePeriodStart = timeSinceActivated % period;
        if (timeSincePeriodStart < period) {
            return false;
        }

        // Check if payout has already occurred during this period
        uint256 periodStart = now.sub(timeSincePeriodStart);
        return feeInfo.lastPaid < periodStart;
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to calculate the sharesDue during settlement
    function __calcSettlementSharesDue(
        address _comptrollerProxy,
        uint256 _sharesSupply,
        uint256 _currentGav,
        uint256 _prevSharePrice
    ) private view returns (int256 sharesDue_) {
        // Calculate fee due in gav
        // _sharesSupply and Gav could have likely fluctuated between calls, so this is an estimated amount
        uint256 estPrevGav = _prevSharePrice.mul(_sharesSupply).div(SHARE_UNIT);
        int256 estGavDiff = int256(_currentGav).sub(int256(estPrevGav));
        int256 feeDueInGav = estGavDiff
            .mul(int256(comptrollerProxyToFeeInfo[_comptrollerProxy].rate))
            .div(int256(RATE_DIVISOR));

        // Calculate raw fee due in shares
        int256 rawSharesDue = feeDueInGav.mul(int256(_sharesSupply)).div(int256(_currentGav));

        // Calculate shares due with inflation or deflation
        if (rawSharesDue == 0) {
            return 0;
        }

        if (rawSharesDue > 0) {
            return int256(__calcSharesDueWithInflation(uint256(rawSharesDue), _sharesSupply));
        } else {
            // TODO: This is where we can implement a separate formula for deflating on negative shares owed.
            // If we use the same formula, change the names-spacing to indicate signed int math.
            return __calcSharesDueWithInflation(rawSharesDue, int256(_sharesSupply));
        }
    }

    /// @dev Helper to settle fee and update performance state
    function __settleAndUpdatePerformance(
        address _comptrollerProxy,
        uint256 _sharesSupply,
        uint256 _currentGav
    ) private returns (int256 sharesDue_) {
        uint256 prevSharePrice = comptrollerProxyToFeeInfo[_comptrollerProxy].lastSharePrice;

        // Calculate shares due
        sharesDue_ = __calcSettlementSharesDue(
            _comptrollerProxy,
            _sharesSupply,
            _currentGav,
            prevSharePrice
        );
        if (sharesDue_ == 0) {
            return 0;
        }

        // Update performance state
        uint256 nextSharePrice;
        // TODO: Revisit this. If a fund has negative shares owed, then the share price will increase,
        // so do not update the lastSharePrice? Calculate based on the new gav per share?
        if (sharesDue_ < 0) {
            nextSharePrice = prevSharePrice;
        } else {
            nextSharePrice = _currentGav.mul(SHARE_UNIT).div(_sharesSupply);
            comptrollerProxyToFeeInfo[_comptrollerProxy].lastSharePrice = nextSharePrice;
        }

        emit PerformanceUpdated(_comptrollerProxy, prevSharePrice, nextSharePrice, sharesDue_);

        return sharesDue_;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getFeeInfoForFund(address _comptrollerProxy)
        external
        view
        returns (FeeInfo memory feeInfo_)
    {
        return comptrollerProxyToFeeInfo[_comptrollerProxy];
    }
}
