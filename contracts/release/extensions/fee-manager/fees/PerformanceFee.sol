// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../../core/fund/comptroller/ComptrollerLib.sol";
import "../FeeManager.sol";
import "./utils/FeeBase.sol";
import "./utils/UpdatableFeeRecipientBase.sol";

/// @title PerformanceFee Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A performance-based fee with configurable rate and crystallization period, using
/// a high watermark
/// @dev This contract assumes that all shares in the VaultProxy are shares outstanding,
/// which is fine for this release. Even if they are not, they are still shares that
/// are only claimable by the fund owner.
contract PerformanceFee is FeeBase, UpdatableFeeRecipientBase {
    using SafeMath for uint256;
    using SignedSafeMath for int256;

    event ActivatedForFund(address indexed comptrollerProxy, uint256 highWaterMark);

    event FundSettingsAdded(address indexed comptrollerProxy, uint256 rate, uint256 period);

    event LastSharePriceUpdated(
        address indexed comptrollerProxy,
        uint256 prevSharePrice,
        uint256 nextSharePrice
    );

    event PaidOut(
        address indexed comptrollerProxy,
        uint256 prevHighWaterMark,
        uint256 nextHighWaterMark,
        uint256 aggregateValueDue
    );

    event PerformanceUpdated(
        address indexed comptrollerProxy,
        uint256 prevAggregateValueDue,
        uint256 nextAggregateValueDue,
        int256 sharesOutstandingDiff
    );

    struct FeeInfo {
        uint16 rate;
        uint64 period;
        uint64 activated;
        uint64 lastPaid;
        uint256 highWaterMark;
        uint256 lastSharePrice;
        uint256 aggregateValueDue;
    }

    uint256 private constant ONE_HUNDRED_PERCENT = 10000;
    uint256 private constant SHARE_UNIT = 10**18;

    mapping(address => FeeInfo) private comptrollerProxyToFeeInfo;

    constructor(address _feeManager) public FeeBase(_feeManager) {}

    // EXTERNAL FUNCTIONS

    /// @notice Activates the fee for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    function activateForFund(address _comptrollerProxy, address) external override onlyFeeManager {
        FeeInfo storage feeInfo = comptrollerProxyToFeeInfo[_comptrollerProxy];

        uint256 grossSharePrice = ComptrollerLib(_comptrollerProxy).calcGrossShareValue();

        feeInfo.highWaterMark = grossSharePrice;
        feeInfo.lastSharePrice = grossSharePrice;
        feeInfo.activated = uint64(block.timestamp);

        emit ActivatedForFund(_comptrollerProxy, grossSharePrice);
    }

    /// @notice Add the initial fee settings for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _settingsData Encoded settings to apply to the fee for a fund
    /// @dev `highWaterMark`, `lastSharePrice`, and `activated` are set during activation
    function addFundSettings(address _comptrollerProxy, bytes calldata _settingsData)
        external
        override
        onlyFeeManager
    {
        (uint16 feeRate, uint64 feePeriod, address recipient) = abi.decode(
            _settingsData,
            (uint16, uint64, address)
        );
        require(feeRate > 0, "addFundSettings: feeRate must be greater than 0");
        // Unlike most other fees, there could be a case for using a rate of exactly 100%,
        // i.e., pay out all profits to a specified recipient
        require(feeRate <= ONE_HUNDRED_PERCENT, "addFundSettings: feeRate max exceeded");
        require(feePeriod > 0, "addFundSettings: feePeriod must be greater than 0");

        comptrollerProxyToFeeInfo[_comptrollerProxy] = FeeInfo({
            rate: feeRate,
            period: feePeriod,
            activated: 0,
            lastPaid: 0,
            highWaterMark: 0,
            lastSharePrice: 0,
            aggregateValueDue: 0
        });

        emit FundSettingsAdded(_comptrollerProxy, feeRate, feePeriod);

        if (recipient != address(0)) {
            __setRecipientForFund(_comptrollerProxy, recipient);
        }
    }

    /// @notice Checks whether the shares outstanding for the fee can be paid out, and updates
    /// the info for the fee's last payout
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @return isPayable_ True if shares outstanding can be paid out
    function payout(address _comptrollerProxy, address)
        external
        override
        onlyFeeManager
        returns (bool isPayable_)
    {
        if (!payoutAllowed(_comptrollerProxy)) {
            return false;
        }

        FeeInfo storage feeInfo = comptrollerProxyToFeeInfo[_comptrollerProxy];
        feeInfo.lastPaid = uint64(block.timestamp);

        uint256 prevHighWaterMark = feeInfo.highWaterMark;
        uint256 nextHighWaterMark = __calcUint256Max(feeInfo.lastSharePrice, prevHighWaterMark);
        uint256 prevAggregateValueDue = feeInfo.aggregateValueDue;

        // Update state as necessary
        if (prevAggregateValueDue > 0) {
            feeInfo.aggregateValueDue = 0;
        }
        if (nextHighWaterMark > prevHighWaterMark) {
            feeInfo.highWaterMark = nextHighWaterMark;
        }

        emit PaidOut(
            _comptrollerProxy,
            prevHighWaterMark,
            nextHighWaterMark,
            prevAggregateValueDue
        );

        return true;
    }

    /// @notice Settles the fee and calculates shares due
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _gav The GAV of the fund
    /// @return settlementType_ The type of settlement
    /// @return (unused) The payer of shares due
    /// @return sharesDue_ The amount of shares due
    function settle(
        address _comptrollerProxy,
        address _vaultProxy,
        IFeeManager.FeeHook,
        bytes calldata,
        uint256 _gav
    )
        external
        override
        onlyFeeManager
        returns (
            IFeeManager.SettlementType settlementType_,
            address,
            uint256 sharesDue_
        )
    {
        if (_gav == 0) {
            return (IFeeManager.SettlementType.None, address(0), 0);
        }

        int256 settlementSharesDue = __settleAndUpdatePerformance(
            _comptrollerProxy,
            _vaultProxy,
            _gav
        );
        if (settlementSharesDue == 0) {
            return (IFeeManager.SettlementType.None, address(0), 0);
        } else if (settlementSharesDue > 0) {
            // Settle by minting shares outstanding for custody
            return (
                IFeeManager.SettlementType.MintSharesOutstanding,
                address(0),
                uint256(settlementSharesDue)
            );
        } else {
            // Settle by burning from shares outstanding
            return (
                IFeeManager.SettlementType.BurnSharesOutstanding,
                address(0),
                uint256(-settlementSharesDue)
            );
        }
    }

    /// @notice Gets whether the fee settles and requires GAV on a particular hook
    /// @param _hook The FeeHook
    /// @return settles_ True if the fee settles on the _hook
    /// @return usesGav_ True if the fee uses GAV during settle() for the _hook
    function settlesOnHook(IFeeManager.FeeHook _hook)
        external
        view
        override
        returns (bool settles_, bool usesGav_)
    {
        if (
            _hook == IFeeManager.FeeHook.PreBuyShares ||
            _hook == IFeeManager.FeeHook.PreRedeemShares ||
            _hook == IFeeManager.FeeHook.Continuous
        ) {
            return (true, true);
        }

        return (false, false);
    }

    /// @notice Updates the fee state after all fees have finished settle()
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _hook The FeeHook being executed
    /// @param _settlementData Encoded args to use in calculating the settlement
    /// @param _gav The GAV of the fund
    function update(
        address _comptrollerProxy,
        address _vaultProxy,
        IFeeManager.FeeHook _hook,
        bytes calldata _settlementData,
        uint256 _gav
    ) external override onlyFeeManager {
        uint256 prevSharePrice = comptrollerProxyToFeeInfo[_comptrollerProxy].lastSharePrice;
        uint256 nextSharePrice = __calcNextSharePrice(
            _comptrollerProxy,
            _vaultProxy,
            _hook,
            _settlementData,
            _gav
        );

        if (nextSharePrice == prevSharePrice) {
            return;
        }

        comptrollerProxyToFeeInfo[_comptrollerProxy].lastSharePrice = nextSharePrice;

        emit LastSharePriceUpdated(_comptrollerProxy, prevSharePrice, nextSharePrice);
    }

    /// @notice Gets whether the fee updates and requires GAV on a particular hook
    /// @param _hook The FeeHook
    /// @return updates_ True if the fee updates on the _hook
    /// @return usesGav_ True if the fee uses GAV during update() for the _hook
    function updatesOnHook(IFeeManager.FeeHook _hook)
        external
        view
        override
        returns (bool updates_, bool usesGav_)
    {
        if (
            _hook == IFeeManager.FeeHook.PostBuyShares ||
            _hook == IFeeManager.FeeHook.PreRedeemShares ||
            _hook == IFeeManager.FeeHook.Continuous
        ) {
            return (true, true);
        }

        return (false, false);
    }

    // PUBLIC FUNCTIONS

    /// @notice Gets the recipient of the fee for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy contract for the fund
    /// @return recipient_ The recipient
    function getRecipientForFund(address _comptrollerProxy)
        public
        view
        override(FeeBase, SettableFeeRecipientBase)
        returns (address recipient_)
    {
        return SettableFeeRecipientBase.getRecipientForFund(_comptrollerProxy);
    }

    /// @notice Checks whether the shares outstanding can be paid out
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @return payoutAllowed_ True if the fee payment is due
    /// @dev Payout is allowed if fees have not yet been settled in a crystallization period,
    /// and at least 1 crystallization period has passed since activation
    function payoutAllowed(address _comptrollerProxy) public view returns (bool payoutAllowed_) {
        FeeInfo memory feeInfo = comptrollerProxyToFeeInfo[_comptrollerProxy];
        uint256 period = feeInfo.period;

        uint256 timeSinceActivated = block.timestamp.sub(feeInfo.activated);

        // Check if at least 1 crystallization period has passed since activation
        if (timeSinceActivated < period) {
            return false;
        }

        // Check that a full crystallization period has passed since the last payout
        uint256 timeSincePeriodStart = timeSinceActivated % period;
        uint256 periodStart = block.timestamp.sub(timeSincePeriodStart);
        return feeInfo.lastPaid < periodStart;
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to calculate the aggregated value accumulated to a fund since the last
    /// settlement (happening at investment/redemption)
    /// Validated:
    /// _netSharesSupply > 0
    /// _sharePriceWithoutPerformance != _prevSharePrice
    function __calcAggregateValueDue(
        uint256 _netSharesSupply,
        uint256 _sharePriceWithoutPerformance,
        uint256 _prevSharePrice,
        uint256 _prevAggregateValueDue,
        uint256 _feeRate,
        uint256 _highWaterMark
    ) private pure returns (uint256) {
        int256 superHWMValueSinceLastSettled = (
            int256(__calcUint256Max(_highWaterMark, _sharePriceWithoutPerformance)).sub(
                int256(__calcUint256Max(_highWaterMark, _prevSharePrice))
            )
        )
            .mul(int256(_netSharesSupply))
            .div(int256(SHARE_UNIT));

        int256 valueDueSinceLastSettled = superHWMValueSinceLastSettled.mul(int256(_feeRate)).div(
            int256(ONE_HUNDRED_PERCENT)
        );

        return
            uint256(
                __calcInt256Max(0, int256(_prevAggregateValueDue).add(valueDueSinceLastSettled))
            );
    }

    /// @dev Helper to calculate the max of two int values
    function __calcInt256Max(int256 _a, int256 _b) private pure returns (int256) {
        if (_a >= _b) {
            return _a;
        }

        return _b;
    }

    /// @dev Helper to calculate the next `lastSharePrice` value
    function __calcNextSharePrice(
        address _comptrollerProxy,
        address _vaultProxy,
        IFeeManager.FeeHook _hook,
        bytes memory _settlementData,
        uint256 _gav
    ) private view returns (uint256 nextSharePrice_) {
        uint256 denominationAssetUnit = 10 **
            uint256(ERC20(ComptrollerLib(_comptrollerProxy).getDenominationAsset()).decimals());
        if (_gav == 0) {
            return denominationAssetUnit;
        }

        // Get shares outstanding via VaultProxy balance and calc shares supply to get net shares supply
        ERC20 vaultProxyContract = ERC20(_vaultProxy);
        uint256 totalSharesSupply = vaultProxyContract.totalSupply();
        uint256 nextNetSharesSupply = totalSharesSupply.sub(
            vaultProxyContract.balanceOf(_vaultProxy)
        );
        if (nextNetSharesSupply == 0) {
            return denominationAssetUnit;
        }

        uint256 nextGav = _gav;

        // For both Continuous and BuySharesCompleted hooks, _gav and shares supply will not change,
        // we only need additional calculations for PreRedeemShares
        if (_hook == IFeeManager.FeeHook.PreRedeemShares) {
            (, uint256 sharesDecrease, ) = __decodePreRedeemSharesSettlementData(_settlementData);

            // Shares have not yet been burned
            nextNetSharesSupply = nextNetSharesSupply.sub(sharesDecrease);
            if (nextNetSharesSupply == 0) {
                return denominationAssetUnit;
            }

            // Assets have not yet been withdrawn
            uint256 gavDecrease = _gav.mul(sharesDecrease).div(totalSharesSupply);

            nextGav = nextGav.sub(gavDecrease);
            if (nextGav == 0) {
                return denominationAssetUnit;
            }
        }

        return nextGav.mul(SHARE_UNIT).div(nextNetSharesSupply);
    }

    /// @dev Helper to calculate the performance metrics for a fund.
    /// Validated:
    /// _totalSharesSupply > 0
    /// _gav > 0
    /// _totalSharesSupply != _totalSharesOutstanding
    function __calcPerformance(
        address _comptrollerProxy,
        uint256 _totalSharesSupply,
        uint256 _totalSharesOutstanding,
        uint256 _prevAggregateValueDue,
        FeeInfo memory feeInfo,
        uint256 _gav
    ) private view returns (uint256 nextAggregateValueDue_, int256 sharesDue_) {
        // Use the 'shares supply net shares outstanding' for performance calcs.
        // Cannot be 0, as _totalSharesSupply != _totalSharesOutstanding
        uint256 netSharesSupply = _totalSharesSupply.sub(_totalSharesOutstanding);
        uint256 sharePriceWithoutPerformance = _gav.mul(SHARE_UNIT).div(netSharesSupply);

        // If gross share price has not changed, can exit early
        uint256 prevSharePrice = feeInfo.lastSharePrice;
        if (sharePriceWithoutPerformance == prevSharePrice) {
            return (_prevAggregateValueDue, 0);
        }

        nextAggregateValueDue_ = __calcAggregateValueDue(
            netSharesSupply,
            sharePriceWithoutPerformance,
            prevSharePrice,
            _prevAggregateValueDue,
            feeInfo.rate,
            feeInfo.highWaterMark
        );

        sharesDue_ = __calcSharesDue(
            _comptrollerProxy,
            netSharesSupply,
            _gav,
            nextAggregateValueDue_
        );

        return (nextAggregateValueDue_, sharesDue_);
    }

    /// @dev Helper to calculate sharesDue during settlement.
    /// Validated:
    /// _netSharesSupply > 0
    /// _gav > 0
    function __calcSharesDue(
        address _comptrollerProxy,
        uint256 _netSharesSupply,
        uint256 _gav,
        uint256 _nextAggregateValueDue
    ) private view returns (int256 sharesDue_) {
        // _nextAggregateValueDue should never be greater than _gav, as the max fee rate is 100%
        uint256 sharesDueForAggregateValueDue = _nextAggregateValueDue.mul(_netSharesSupply).div(
            _gav.sub(_nextAggregateValueDue)
        );

        // Shares due is the +/- diff or the total shares outstanding already minted
        return
            int256(sharesDueForAggregateValueDue).sub(
                int256(
                    FeeManager(FEE_MANAGER).getFeeSharesOutstandingForFund(
                        _comptrollerProxy,
                        address(this)
                    )
                )
            );
    }

    /// @dev Helper to calculate the max of two uint values
    function __calcUint256Max(uint256 _a, uint256 _b) private pure returns (uint256) {
        if (_a >= _b) {
            return _a;
        }

        return _b;
    }

    /// @dev Helper to settle the fee and update performance state.
    /// Validated:
    /// _gav > 0
    function __settleAndUpdatePerformance(
        address _comptrollerProxy,
        address _vaultProxy,
        uint256 _gav
    ) private returns (int256 sharesDue_) {
        ERC20 sharesTokenContract = ERC20(_vaultProxy);

        uint256 totalSharesSupply = sharesTokenContract.totalSupply();
        if (totalSharesSupply == 0) {
            return 0;
        }

        uint256 totalSharesOutstanding = sharesTokenContract.balanceOf(_vaultProxy);
        if (totalSharesOutstanding == totalSharesSupply) {
            return 0;
        }

        FeeInfo storage feeInfo = comptrollerProxyToFeeInfo[_comptrollerProxy];
        uint256 prevAggregateValueDue = feeInfo.aggregateValueDue;

        uint256 nextAggregateValueDue;
        (nextAggregateValueDue, sharesDue_) = __calcPerformance(
            _comptrollerProxy,
            totalSharesSupply,
            totalSharesOutstanding,
            prevAggregateValueDue,
            feeInfo,
            _gav
        );
        if (nextAggregateValueDue == prevAggregateValueDue) {
            return 0;
        }

        // Update fee state
        feeInfo.aggregateValueDue = nextAggregateValueDue;

        emit PerformanceUpdated(
            _comptrollerProxy,
            prevAggregateValueDue,
            nextAggregateValueDue,
            sharesDue_
        );

        return sharesDue_;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the feeInfo for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy contract of the fund
    /// @return feeInfo_ The feeInfo
    function getFeeInfoForFund(address _comptrollerProxy)
        external
        view
        returns (FeeInfo memory feeInfo_)
    {
        return comptrollerProxyToFeeInfo[_comptrollerProxy];
    }
}
