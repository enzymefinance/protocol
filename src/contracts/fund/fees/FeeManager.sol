pragma solidity ^0.4.21;

import "./Fee.i.sol";
import "../hub/Spoke.sol";
import "../shares/Shares.sol";
import "../../factory/Factory.sol";
import "../../dependencies/math.sol";
import "../../engine/AmguConsumer.sol";

/// @notice Manages and allocates fees for a particular fund
contract FeeManager is DSMath, AmguConsumer, Spoke {

    Fee[] public fees;
    mapping (address => bool) public feeIsRegistered;
    event FeeRewarded(uint shareQuantity);

    constructor(address _hub) Spoke(_hub) {}

    function register(address feeAddress) public auth {
        require(!feeIsRegistered[feeAddress], "Fee already registered");
        feeIsRegistered[feeAddress] = true;
        fees.push(Fee(feeAddress));
        Fee(feeAddress).updateState();  // initialize state
    }

    function batchRegister(address[] feeAddresses) public auth {
        for (uint i = 0; i < feeAddresses.length; i++) {
            register(feeAddresses[i]);
        }
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
        emit FeeRewarded(rewardShares);
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
    function createInstance(address _hub) public returns (address) {
        address feeManager = new FeeManager(_hub);
        childExists[feeManager] = true;
        emit NewInstance(_hub, feeManager);
        return feeManager;
    }
}

