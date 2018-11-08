pragma solidity ^0.4.21;

import "./Fee.i.sol";
import "../hub/Spoke.sol";
import "../shares/Shares.sol";
import "../../factory/Factory.sol";
import "../../dependencies/math.sol";

// TODO: permissioning
/// @notice Manages and allocates fees for a particular fund
contract FeeManager is Spoke, DSMath {

    Fee[] public fees;
    mapping (address => bool) public feeIsRegistered;

    constructor(address _hub) Spoke(_hub) {}

    function register(address feeAddress) public {
        require(!feeIsRegistered[feeAddress]);
        feeIsRegistered[feeAddress] = true;
        fees.push(Fee(feeAddress));
    }

    function batchRegister(address[] feeAddresses) public {
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

    function rewardFee(Fee fee) public {
        require(feeIsRegistered[fee]);
        uint rewardShares = fee.feeAmount();
        fee.updateState();
        Shares(routes.shares).createFor(hub.manager(), rewardShares);
    }

    function rewardAllFees() public {
        for (uint i = 0; i < fees.length; i++) {
            rewardFee(fees[i]);
        }
    }

    /// @dev Convenience function
    /// @dev Convention that management fee is 0
    function rewardManagementFee() public {
        rewardFee(fees[0]);
    }

    /// @dev Convenience function
    /// @dev Convention that performace fee is 1
    function rewardPerformanceFee() public {
        rewardFee(fees[1]);
    }

    /// @dev Convenience function
    /// @dev Convention that performace fee is 1
    function performanceFeeAmount() public returns (uint) {
        return fees[1].feeAmount();
    }
}

contract FeeManagerFactory is Factory {
    function createInstance(address _hub) public returns (address) {
        address feeManager = new FeeManager(_hub);
        childExists[feeManager] = true;
        return feeManager;
    }
}

