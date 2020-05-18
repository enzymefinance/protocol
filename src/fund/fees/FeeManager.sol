pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "../../dependencies/DSMath.sol";
import "../hub/Spoke.sol";
import "./IFee.sol";
import "./IFeeManager.sol";

/// @title FeeManager Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Manages and allocates fees for a particular fund
contract FeeManager is IFeeManager, DSMath, Spoke {

    event FeeReward(uint shareQuantity);
    event FeeRegistration(address fee);

    struct FeeInfo {
        address feeAddress;
        uint feeRate;
        uint feePeriod;
    }

    IFee[] public fees;
    mapping (address => bool) public feeIsRegistered;

    constructor(
        address _hub,
        address _denominationAsset,
        address[] memory _fees,
        uint[] memory _rates,
        uint[] memory _periods
    )
        Spoke(_hub)
        public
    {
        for (uint i = 0; i < _fees.length; i++) {
            require(
                IRegistry(IHub(_hub).REGISTRY()).feeIsRegistered(_fees[i]),
                "Fee must be known to Registry"
            );
            register(_fees[i], _rates[i], _periods[i], _denominationAsset);
        }
        if (fees.length > 0) {
            require(
                fees[0].identifier() == 0,
                "Management fee must be at 0 index"
            );
        }
        if (fees.length > 1) {
            require(
                fees[1].identifier() == 1,
                "Performance fee must be at 1 index"
            );
        }
    }

    function register(
        address feeAddress,
        uint feeRate,
        uint feePeriod,
        address denominationAsset
    )
        internal
    {
        require(!feeIsRegistered[feeAddress], "Fee already registered");
        feeIsRegistered[feeAddress] = true;
        fees.push(IFee(feeAddress));
        IFee(feeAddress).initializeForUser(feeRate, feePeriod, denominationAsset);  // initialize state
        emit FeeRegistration(feeAddress);
    }

    function totalFeeAmount() external override returns (uint total) {
        for (uint i = 0; i < fees.length; i++) {
            total = add(total, fees[i].feeAmount());
        }
        return total;
    }

    /// @dev Shares to be inflated after update state
    function _rewardFee(IFee fee) internal {
        require(feeIsRegistered[address(fee)], "Fee is not registered");
        uint rewardShares = fee.feeAmount();
        if (rewardShares > 0) {
            try fee.updateState() {
                __getShares().createFor(IHub(HUB).MANAGER(), rewardShares);
                emit FeeReward(rewardShares);
            }
            catch {}
        }
    }

    /// @notice Reward all fees
    /// @dev Can be called by anyone
    function rewardAllFees() external override {
        for (uint i = 0; i < fees.length; i++) {
            _rewardFee(fees[i]);
        }
    }

    /// @dev Convenience function; anyone can reward management fee any time
    /// @dev Convention that management fee is 0
    function rewardManagementFee() public override {
        if (fees.length >= 1) _rewardFee(fees[0]);
    }

    /// @dev Convenience function
    /// @dev Convention that management fee is 0
    function managementFeeAmount() external override returns (uint) {
        if (fees.length < 1) return 0;
        return fees[0].feeAmount();
    }

    /// @dev Convenience function
    /// @dev Convention that performace fee is 1
    function performanceFeeAmount() external override returns (uint) {
        if (fees.length < 2) return 0;
        return fees[1].feeAmount();
    }
}

contract FeeManagerFactory {
    function createInstance(
        address _hub,
        address _denominationAsset,
        address[] calldata _fees,
        uint256[] calldata _feeRates,
        uint256[] calldata _feePeriods
    ) external returns (address) {
        return address(
            new FeeManager(_hub, _denominationAsset, _fees, _feeRates, _feePeriods)
        );
    }
}
