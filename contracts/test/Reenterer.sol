// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title Reenterer Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A test contract that can perform callbacks to test reentrance
contract Reenterer {
    address public receiveReentrantContract;
    bytes public receiveReentrantData;
    uint256 public receiveReentrantValue;
    bytes public receiveReentrantReturnData;

    receive() external payable {
        if (receiveReentrantContract != address(0)) {
            if (receiveReentrantValue == type(uint256).max) {
                receiveReentrantValue = address(this).balance;
            }

            (, bytes memory returnData) = receiveReentrantContract.call{
                value: receiveReentrantValue
            }(receiveReentrantData);

            // Store the revert message rather than reverting,
            // since sometimes the caller will not bubble up our message
            receiveReentrantReturnData = returnData;
        }
    }

    function setReceiveReentrantPayload(
        address _contract,
        bytes calldata _data,
        uint256 _value
    ) external {
        receiveReentrantContract = _contract;
        receiveReentrantData = _data;
        receiveReentrantValue = _value;
    }
}
