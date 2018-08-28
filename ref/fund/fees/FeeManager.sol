pragma solidity ^0.4.21;

import "./Fee.sol";

contract FeeManager {

    Fee[] public fees;

    function register(address feeAddress) public {
        fees.push(Fee(fee));
    }

    function batchRegister(address[] feeAddresses) public {
        for (uint i = 0; i < feeAddresses.length; i++) {
            register(feeAddresses[i]);
        }
    }

    /// @dev May modify state of Fees
    function calculateTotalFees(address hub) public returns (uint total) {
        for (uint i = 0; i < fees.length; i++) {
            total = add(total, fees[i].calculate(hub));
        }
        return total;
    }
}

