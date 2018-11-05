pragma solidity ^0.4.21;


import "./Fee.i.sol";
import "../hub/Spoke.sol";
import "../shares/Shares.sol";
import "../../factory/Factory.sol";
import "../../dependencies/math.sol";

/// @notice Manages and allocates fees for a particular fund
contract FeeManager is DSMath, Spoke {

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
            total = add(total, fees[i].amountFor(hub));
        }
        return total;
    }

    function rewardFee(Fee fee) public {
        require(feeIsRegistered[fee]);
        uint rewardShares = fee.amountFor(hub);
        fee.updateFor(hub);
        Shares(routes.shares).createFor(hub.manager(), rewardShares);
    }

    function rewardAllFees() public {
        for (uint i = 0; i < fees.length; i++) {
            rewardFee(fees[i]);
        }
    }
}

contract FeeManagerFactory is Factory {
    function createInstance(address _hub) public returns (address) {
        address feeManager = new FeeManager(_hub);
        childExists[feeManager] = true;
        return feeManager;
    }
}

