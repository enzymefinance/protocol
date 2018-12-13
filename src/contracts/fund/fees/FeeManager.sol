pragma solidity ^0.4.21;
pragma experimental ABIEncoderV2;

import "Fee.i.sol";
import "Spoke.sol";
import "Shares.sol";
import "Factory.sol";
import "math.sol";
import "AmguConsumer.sol";

/// @notice Manages and allocates fees for a particular fund
contract FeeManager is DSMath, AmguConsumer, Spoke {

    event FeeReward(uint shareQuantity);
    event FeeRegistration(address fee);

    struct FeeInfo {
        address feeAddress;
        uint feeRate;
        uint feePeriod;
    }

    Fee[] public fees;
    mapping (address => bool) public feeIsRegistered;

    constructor(address _hub, address[] _fees, uint[] _rates, uint[] _periods) Spoke(_hub) public {
        for (uint i = 0; i < _fees.length; i++) {
            register(_fees[i], _rates[i], _periods[i]);
        }
    }

    function register(address feeAddress, uint feeRate, uint feePeriod) internal {
        require(!feeIsRegistered[feeAddress], "Fee already registered");
        feeIsRegistered[feeAddress] = true;
        fees.push(Fee(feeAddress));
        Fee(feeAddress).initializeForUser(feeRate, feePeriod);  // initialize state
        emit FeeRegistration(feeAddress);
    }

    function totalFeeAmount() public view returns (uint total) {
        for (uint i = 0; i < fees.length; i++) {
            total = add(total, fees[i].feeAmount());
        }
        return total;
    }

    function _rewardFee(Fee fee) internal {
        require(feeIsRegistered[fee], "Fee is not registered");
        uint rewardShares = fee.feeAmount();
        fee.updateState();
        Shares(routes.shares).createFor(hub.manager(), rewardShares);
        emit FeeReward(rewardShares);
    }

    function _rewardAllFees() internal {
        for (uint i = 0; i < fees.length; i++) {
            _rewardFee(fees[i]);
        }
    }

    /// @dev Used when calling from other components
    function rewardAllFees() public auth { _rewardAllFees(); }

    /// @dev Used when calling from outside the fund
    function triggerRewardAllFees() external payable amguPayable {
        _rewardAllFees();
    }

    /// @dev Convenience function; anyone can reward management fee any time
    /// @dev Convention that management fee is 0
    function rewardManagementFee() public {
        if (fees.length >= 1) _rewardFee(fees[0]);
    }

    /// @dev Convenience function
    /// @dev Convention that performace fee is 1
    function performanceFeeAmount() public view returns (uint) {
        if (fees.length < 2) return 0;
        return fees[1].feeAmount();
    }
}

contract FeeManagerFactory is Factory {
    function createInstance(
        address _hub,
        address[] _fees,
        uint[] _feeRates,
        uint[] _feePeriods
    ) public returns (address) {
        address feeManager = new FeeManager(_hub, _fees, _feeRates, _feePeriods);
        childExists[feeManager] = true;
        return feeManager;
    }
}

