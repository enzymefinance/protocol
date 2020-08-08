// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../hub/Spoke.sol";
import "../shares/Shares.sol";
import "./utils/ContinuousFeeBase.sol";

/// @title PerformanceFee Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Calculates the performance fee for a particular fund
contract PerformanceFee is ContinuousFeeBase {
    using SafeMath for uint256;
    using SignedSafeMath for int256;

    event FundSettingsAdded(address indexed feeManager, uint256 rate, uint256 period);

    event PaidOut(address indexed feeManager, uint256 sharesDue);

    event PerformanceUpdated(
        address indexed feeManager,
        uint256 prevSharePrice,
        uint256 currentSharePrice,
        int256 sharesOutstandingDiff
    );

    struct FeeInfo {
        uint256 rate;
        uint256 period;
        uint256 created;
        uint256 lastPaid;
        uint256 lastSharePrice;
    }

    uint256 private constant RATE_DIVISOR = 10**18;

    mapping(address => FeeInfo) public feeManagerToFeeInfo;

    constructor(address _registry) public ContinuousFeeBase(_registry) {}

    // EXTERNAL FUNCTIONS

    /// @notice Add the initial fee settings for a fund
    /// @param _encodedSettings Encoded settings to apply to a fund
    /// @dev A fund's FeeManager is always the sender
    /// @dev Only called once, on FeeManager.enableFees()
    function addFundSettings(bytes calldata _encodedSettings) external override onlyFeeManager {
        (uint256 feeRate, uint256 feePeriod) = abi.decode(_encodedSettings, (uint256, uint256));
        require(feeRate > 0, "addFundSettings: feeRate must be greater than 0");
        require(feePeriod > 0, "addFundSettings: feePeriod must be greater than 0");

        feeManagerToFeeInfo[msg.sender] = FeeInfo({
            rate: feeRate,
            period: feePeriod,
            created: block.timestamp,
            lastPaid: block.timestamp,
            lastSharePrice: Shares(__getShares()).calcSharePrice()
        });

        emit FundSettingsAdded(msg.sender, feeRate, feePeriod);
    }

    /// @notice Provides a constant string identifier for a fee
    /// @return The identifier string
    function identifier() external override pure returns (string memory) {
        return "PERFORMANCE";
    }

    /// @notice Payout shares outstanding to the fund manager
    /// @return payer_ The account from which the sharesDue will be deducted
    /// @return payee_ The account to which the sharesDue will be added
    /// @return sharesDue_ The amount of shares that should be distributed from payer_ to payee_
    function payoutSharesOutstanding()
        external
        override
        onlyFeeManager
        returns (
            address payer_,
            address payee_,
            uint256 sharesDue_
        )
    {
        if (!payoutAllowed(msg.sender)) {
            return __emptySharesDueValues();
        }

        Hub hub = Hub(Spoke(msg.sender).HUB());
        Shares shares = Shares(__getShares(address(hub)));

        sharesDue_ = shares.balanceOf(address(this));
        if (sharesDue_ == 0) {
            return __emptySharesDueValues();
        }

        // Distribute shares outstanding from fee custody to fund manager
        payer_ = address(this);
        payee_ = hub.MANAGER();

        feeManagerToFeeInfo[msg.sender].lastPaid = block.timestamp;

        emit PaidOut(msg.sender, sharesDue_);
    }

    /// @notice Settle the fee and reconcile shares due
    /// @return payer_ The account from which the sharesDue will be deducted
    /// @return payee_ The account to which the sharesDue will be added
    /// @return sharesDue_ The amount of shares that should be distributed from payer_ to payee_
    function settle(bytes calldata)
        external
        override
        onlyFeeManager
        returns (
            address payer_,
            address payee_,
            uint256 sharesDue_
        )
    {
        Shares shares = Shares(__getShares());
        uint256 sharesSupply = shares.totalSupply();
        if (sharesSupply == 0) {
            return __emptySharesDueValues();
        }

        int256 settlementSharesDue = __settleAndUpdatePerformance(
            msg.sender,
            shares,
            sharesSupply
        );
        if (settlementSharesDue == 0) {
            return __emptySharesDueValues();
        }

        if (settlementSharesDue > 0) {
            // Settle by minting shares outstanding to the fee for custody
            payer_ = address(shares);
            payee_ = address(this);
            sharesDue_ = uint256(settlementSharesDue);
        } else {
            // Settle by burning from shares outstanding from the fee's custody
            payer_ = address(this);
            payee_ = address(shares);
            sharesDue_ = uint256(-settlementSharesDue);
        }
    }

    // PUBLIC FUNCTIONS

    /// @notice Checks whether the outstanding shares can be paid out
    /// @param _feeManager The feeManager for which to check whether the fee is due
    /// @return True if the fee payment is due
    /// @dev Payout is allowed if fees have not yet been settled in an elapsed redemption period
    function payoutAllowed(address _feeManager) public view returns (bool) {
        FeeInfo memory feeInfo = feeManagerToFeeInfo[_feeManager];

        uint256 timeSinceCreated = block.timestamp.sub(feeInfo.created);
        uint256 timeSinceRedeemWindowStart = timeSinceCreated % feeInfo.period;
        uint256 redeemWindowStart = block.timestamp.sub(timeSinceRedeemWindowStart);
        return feeInfo.lastPaid < redeemWindowStart;
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to calculate the sharesDue during settlement
    function __calcSettlementSharesDue(
        address _feeManager,
        uint256 _sharesUnit,
        uint256 _sharesSupply,
        uint256 _currentGav,
        uint256 _prevSharePrice
    ) private view returns (int256) {
        // Calculate fee due in gav
        // _sharesSupply and Gav could have likely fluctuated between calls, so this is an estimated amount
        uint256 estPrevGav = _prevSharePrice.mul(_sharesSupply).div(_sharesUnit);
        int256 estGavDiff = int256(_currentGav).sub(int256(estPrevGav));
        int256 feeDueInGav = estGavDiff.mul(int256(feeManagerToFeeInfo[_feeManager].rate)).div(
            int256(RATE_DIVISOR)
        );

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
        address _feeManager,
        Shares _shares,
        uint256 _sharesSupply
    ) private returns (int256 sharesDue_) {
        uint256 sharesUnit = 10**uint256(_shares.decimals());
        uint256 gav = _shares.calcGav();
        uint256 prevSharePrice = feeManagerToFeeInfo[_feeManager].lastSharePrice;

        // Calculate shares due
        sharesDue_ = __calcSettlementSharesDue(
            _feeManager,
            sharesUnit,
            _sharesSupply,
            gav,
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
            nextSharePrice = gav.mul(sharesUnit).div(_sharesSupply);
            feeManagerToFeeInfo[_feeManager].lastSharePrice = nextSharePrice;
        }

        emit PerformanceUpdated(_feeManager, prevSharePrice, nextSharePrice, sharesDue_);
    }
}
