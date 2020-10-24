// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../../core/fund/comptroller/ComptrollerLib.sol";
import "../../utils/SharesInflationMixin.sol";
import "../FeeManager.sol";
import "./utils/FeeBase.sol";

/// @title PerformanceFee Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Calculates the performance fee for a particular fund
contract PerformanceFee is FeeBase, SharesInflationMixin {
    using SignedSafeMath for int256;

    event ActivatedForFund(address indexed comptrollerProxy, uint256 highWaterMark);

    event FundSettingsAdded(address indexed comptrollerProxy, uint256 rate, uint256 period);

    event PaidOut(
        address indexed comptrollerProxy,
        uint256 prevHighWaterMark,
        uint256 nextHighWaterMark
    );

    event PerformanceUpdated(
        address indexed comptrollerProxy,
        uint256 prevSharePrice,
        uint256 nextSharePrice,
        uint256 prevAggregateValueDue,
        uint256 nextAggregateValueDue,
        int256 sharesOutstandingDiff
    );

    struct FeeInfo {
        uint256 rate;
        uint256 period;
        uint256 activated;
        uint256 lastPaid;
        uint256 highWaterMark;
        uint256 lastSharePrice;
        uint256 aggregateValueDue;
    }

    uint256 private constant RATE_DIVISOR = 10**18;
    uint256 private constant SHARE_UNIT = 10**18;

    mapping(address => FeeInfo) private comptrollerProxyToFeeInfo;

    constructor(address _feeManager) public FeeBase(_feeManager) {}

    // EXTERNAL FUNCTIONS

    /// @notice Activates the fee for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    function activateForFund(address _comptrollerProxy) external override onlyFeeManager {
        FeeInfo storage feeInfo = comptrollerProxyToFeeInfo[_comptrollerProxy];
        feeInfo.activated = block.timestamp;

        // TODO: what if GAV is invalid?
        uint256 grossSharePrice = ComptrollerLib(_comptrollerProxy).calcGrossShareValue();
        feeInfo.highWaterMark = grossSharePrice;
        feeInfo.lastSharePrice = grossSharePrice;

        emit ActivatedForFund(_comptrollerProxy, grossSharePrice);
    }

    /// @notice Add the initial fee settings for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the calling fund
    /// @param _settingsData Encoded settings to apply to the policy for a fund
    /// @dev `lastSharePrice` and `activated` are added during activation
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
            highWaterMark: 0,
            lastSharePrice: 0,
            aggregateValueDue: 0
        });

        emit FundSettingsAdded(_comptrollerProxy, feeRate, feePeriod);
    }

    /// @notice Provides a constant string identifier for a fee
    /// @return identifier_ The identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "PERFORMANCE";
    }

    /// @notice Update fee state for fund, if payout is allowed
    /// @param _comptrollerProxy The ComptrollerProxy of the calling fund
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
        feeInfo.lastPaid = block.timestamp;

        uint256 prevHighWaterMark = feeInfo.highWaterMark;
        uint256 nextHighWaterMark = __calcUint256Max(feeInfo.lastSharePrice, prevHighWaterMark);

        emit PaidOut(_comptrollerProxy, prevHighWaterMark, nextHighWaterMark);

        // Return early if HWM did not increase
        if (nextHighWaterMark == prevHighWaterMark) {
            return false;
        }

        feeInfo.highWaterMark = nextHighWaterMark;

        return true;
    }

    /// @notice Settle the fee and reconcile shares due
    /// @param _comptrollerProxy The ComptrollerProxy of the calling fund
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _hook The FeeHook being executed
    /// @param _settlementData Encoded args to use in calculating the settlement
    /// @return settlementType_ The type of settlement
    /// @return (unused) The payer of shares due
    /// @return sharesDue_ The amount of shares due
    function settle(
        address _comptrollerProxy,
        address _vaultProxy,
        IFeeManager.FeeHook _hook,
        bytes calldata _settlementData
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
        int256 settlementSharesDue = __settleAndUpdatePerformance(
            _comptrollerProxy,
            _vaultProxy,
            _hook,
            _settlementData
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

    /// @notice Checks whether the fee is settled on a given hook
    /// @return settlesOnHook_ True if the fee is settled on the hook
    function settlesOnHook(IFeeManager.FeeHook _hook)
        external
        pure
        override
        returns (bool settlesOnHook_)
    {
        return
            _hook == IFeeManager.FeeHook.Continuous ||
            _hook == IFeeManager.FeeHook.PreBuyShares ||
            _hook == IFeeManager.FeeHook.PreRedeemShares;
    }

    // PUBLIC FUNCTIONS

    /// @notice Checks whether the outstanding shares can be paid out
    /// @param _comptrollerProxy The ComptrollerProxy of the calling fund
    /// @return payoutAllowed_ True if the fee payment is due
    /// @dev Payout is allowed if fees have not yet been settled in an elapsed redemption period
    function payoutAllowed(address _comptrollerProxy) public view returns (bool payoutAllowed_) {
        FeeInfo memory feeInfo = comptrollerProxyToFeeInfo[_comptrollerProxy];
        uint256 period = feeInfo.period;

        uint256 timeSinceActivated = block.timestamp.sub(feeInfo.activated);

        // Check if at least 1 period has passed since activation
        if (timeSinceActivated < period) {
            return false;
        }

        // Check that a full period has passed since the last payout
        uint256 timeSincePeriodStart = timeSinceActivated % period;
        uint256 periodStart = block.timestamp.sub(timeSincePeriodStart);
        return feeInfo.lastPaid < periodStart;
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to calculate the total accrued value for a fund
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
            int256(RATE_DIVISOR)
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
        ComptrollerLib _comptrollerProxyContract,
        IFeeManager.FeeHook _hook,
        bytes memory _settlementData,
        uint256 _totalSharesSupply,
        int256 _sharesDue,
        uint256 _netSharesSupply,
        uint256 _gav
    ) private view returns (uint256 nextSharePrice_) {
        uint256 sharesSupplyWithSharesDue = uint256(int256(_totalSharesSupply).add(_sharesDue));
        uint256 denominationAssetUnit = 10 **
            uint256(ERC20(_comptrollerProxyContract.getDenominationAsset()).decimals());

        uint256 nextNetSharesSupply;
        uint256 nextGav;
        if (_hook == IFeeManager.FeeHook.PreBuyShares) {
            (, uint256 gavIncrease, , ) = __decodePreBuySharesSettlementData(_settlementData);
            nextGav = _gav.add(gavIncrease);

            uint256 sharesIncrease = gavIncrease
                .mul(denominationAssetUnit)
                .mul(sharesSupplyWithSharesDue)
                .div(_gav)
                .div(SHARE_UNIT);
            nextNetSharesSupply = _netSharesSupply.add(sharesIncrease);
        } else {
            // If not PreBuyShares, must be PreRedeemShares
            (, uint256 sharesDecrease) = __decodePreRedeemSharesSettlementData(_settlementData);
            nextNetSharesSupply = _netSharesSupply.sub(sharesDecrease);

            uint256 gavDecrease = sharesDecrease
                .mul(_gav)
                .mul(SHARE_UNIT)
                .div(sharesSupplyWithSharesDue)
                .div(denominationAssetUnit);
            nextGav = _gav.sub(gavDecrease);
        }

        return nextGav.mul(SHARE_UNIT).div(nextNetSharesSupply);
    }

    /// @dev Helper to calculate the performance metrics for a fund
    function __calcPerformance(
        ComptrollerLib _comptrollerProxyContract,
        IFeeManager.FeeHook _hook,
        bytes memory _settlementData,
        uint256 _totalSharesSupply,
        uint256 _sharesOutstanding,
        uint256 _prevAggregateValueDue,
        uint256 _prevSharePrice,
        FeeInfo memory feeInfo
    )
        private
        returns (
            uint256 nextAggregateValueDue_,
            uint256 nextSharePrice_,
            int256 sharesDue_
        )
    {
        // Use the shares supply net shares outstanding for performance calcs
        uint256 netSharesSupply = _totalSharesSupply.sub(_sharesOutstanding);
        uint256 gav;
        if (_hook == IFeeManager.FeeHook.PreBuyShares) {
            (, , , gav) = __decodePreBuySharesSettlementData(_settlementData);
        } else {
            gav = _comptrollerProxyContract.calcGav(false);
        }
        uint256 sharePriceWithoutPerformance = gav.mul(SHARE_UNIT).div(netSharesSupply);

        // If gross share price has not changed, can exit early
        if (sharePriceWithoutPerformance == _prevSharePrice) {
            return (_prevAggregateValueDue, _prevSharePrice, 0);
        }

        nextAggregateValueDue_ = __calcAggregateValueDue(
            netSharesSupply,
            sharePriceWithoutPerformance,
            _prevSharePrice,
            _prevAggregateValueDue,
            feeInfo.rate,
            feeInfo.highWaterMark
        );

        sharesDue_ = __calcSharesDue(
            netSharesSupply,
            gav,
            _sharesOutstanding,
            nextAggregateValueDue_
        );

        if (_hook == IFeeManager.FeeHook.Continuous) {
            nextSharePrice_ = sharePriceWithoutPerformance;
        } else {
            nextSharePrice_ = __calcNextSharePrice(
                _comptrollerProxyContract,
                _hook,
                _settlementData,
                _totalSharesSupply,
                sharesDue_,
                netSharesSupply,
                gav
            );
        }

        return (nextAggregateValueDue_, nextSharePrice_, sharesDue_);
    }

    /// @dev Helper to calculate sharesDue during settlement
    function __calcSharesDue(
        uint256 _netSharesSupply,
        uint256 _gav,
        uint256 _sharesOutstanding,
        uint256 _nextAggregateValueDue
    ) private pure returns (int256 sharesDue_) {
        uint256 sharesDueForAggregateValueDue = __calcSharesDueWithInflation(
            _nextAggregateValueDue.mul(_netSharesSupply).div(_gav),
            _netSharesSupply
        );
        // Shares due is either the +/- diff or the total shares outstanding already minted
        return int256(sharesDueForAggregateValueDue).sub(int256(_sharesOutstanding));
    }

    /// @dev Helper to calculate the max of two uint values
    function __calcUint256Max(uint256 _a, uint256 _b) private pure returns (uint256) {
        if (_a >= _b) {
            return _a;
        }

        return _b;
    }

    /// @dev Helper to settle the fee and update performance state
    function __settleAndUpdatePerformance(
        address _comptrollerProxy,
        address _vaultProxy,
        IFeeManager.FeeHook _hook,
        bytes memory _settlementData
    ) private returns (int256 sharesDue_) {
        ComptrollerLib comptrollerProxyContract = ComptrollerLib(_comptrollerProxy);

        uint256 totalSharesSupply = ERC20(_vaultProxy).totalSupply();
        if (totalSharesSupply == 0) {
            return 0;
        }

        uint256 sharesOutstanding = FeeManager(FEE_MANAGER).getFeeSharesOutstandingForFund(
            _comptrollerProxy,
            address(this)
        );
        if (sharesOutstanding == totalSharesSupply) {
            return 0;
        }

        FeeInfo storage feeInfo = comptrollerProxyToFeeInfo[_comptrollerProxy];
        uint256 prevAggregateValueDue = feeInfo.aggregateValueDue;
        uint256 prevSharePrice = feeInfo.lastSharePrice;

        uint256 nextAggregateValueDue;
        uint256 nextSharePrice;
        (nextAggregateValueDue, nextSharePrice, sharesDue_) = __calcPerformance(
            comptrollerProxyContract,
            _hook,
            _settlementData,
            totalSharesSupply,
            sharesOutstanding,
            prevAggregateValueDue,
            prevSharePrice,
            feeInfo
        );
        if (prevAggregateValueDue == nextAggregateValueDue) {
            return 0;
        }

        // Update fee state
        feeInfo.aggregateValueDue = nextAggregateValueDue;
        if (prevSharePrice != nextSharePrice) {
            feeInfo.lastSharePrice = nextSharePrice;
        }

        emit PerformanceUpdated(
            _comptrollerProxy,
            prevSharePrice,
            nextSharePrice,
            prevAggregateValueDue,
            nextAggregateValueDue,
            sharesDue_
        );

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
