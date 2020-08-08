// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../shares/Shares.sol";
import "./utils/ContinuousFeeBase.sol";

/// @title ManagementFee Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Calculates the management fee for a particular fund
contract ManagementFee is ContinuousFeeBase {
	using SafeMath for uint256;

	event FundSettingsAdded(address indexed feeManager, uint256 rate);

	event PaidOut(address indexed feeManager, uint256 sharesQuantity);

	struct FeeInfo {
		uint256 rate;
		uint256 lastPaid;
	}

	uint256 constant private RATE_PERIOD = 365 days;
	uint256 constant private RATE_DIVISOR = 10**18;

	mapping(address => FeeInfo) public feeManagerToFeeInfo;

	constructor(address _registry) public ContinuousFeeBase(_registry) {}

	// EXTERNAL FUNCTIONS

	/// @notice Add the initial fee settings for a fund
	/// @param _encodedSettings Encoded settings to apply to a fund
	/// @dev A fund's FeeManager is always the sender
	/// @dev Only called once, on FeeManager.enableFees()
	function addFundSettings(bytes calldata _encodedSettings) external override onlyFeeManager {
		uint256 feeRate = abi.decode(_encodedSettings, (uint256));
		require(feeRate > 0, "addFundSettings: feeRate must be greater than 0");

		feeManagerToFeeInfo[msg.sender] = FeeInfo({ rate: feeRate, lastPaid: block.timestamp });

		emit FundSettingsAdded(msg.sender, feeRate);
	}

	/// @notice Provides a constant string identifier for a fee
	/// @return The identifier string
	function identifier() external override pure returns (string memory) {
		return "MANAGEMENT";
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
		Hub hub = Hub(Spoke(msg.sender).HUB());
		Shares shares = Shares(__getShares(address(hub)));
		uint256 sharesSupply = shares.totalSupply();

		sharesDue_ = __calcSettlementSharesDue(msg.sender, sharesSupply);
		if (sharesDue_ == 0) {
			return __emptySharesDueValues();
		}

		// Settle by minting shares to manager
		payer_ = address(shares);
		payee_ = hub.MANAGER();

		// Update fee state for fund
		feeManagerToFeeInfo[msg.sender].lastPaid = block.timestamp;

		emit PaidOut(msg.sender, sharesDue_);
	}

	// PRIVATE FUNCTIONS

	/// @dev Helper to calculate the shares due at settlement (including inflation)
	function __calcSettlementSharesDue(address _feeManager, uint256 _sharesQuantity)
		private
		view
		returns (uint256)
	{
		if (_sharesQuantity == 0) {
			return 0;
		}

		FeeInfo memory feeInfo = feeManagerToFeeInfo[_feeManager];
		uint256 timeSinceLastPaid = block.timestamp.sub(feeInfo.lastPaid);
		if (timeSinceLastPaid == 0) {
			return 0;
		}

		uint256 yearlySharesDueRate = _sharesQuantity.mul(feeInfo.rate).div(RATE_DIVISOR);
		uint256 rawSharesDue = yearlySharesDueRate.mul(timeSinceLastPaid).div(RATE_PERIOD);

		return __calcSharesDueWithInflation(rawSharesDue, _sharesQuantity);
	}
}
