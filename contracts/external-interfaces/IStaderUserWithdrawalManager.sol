// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IStaderUserWithdrawalManager Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IStaderUserWithdrawalManager {
    struct UserWithdrawInfo {
        address payable owner;
        uint256 ethXAmount;
        uint256 ethExpected;
        uint256 ethFinalized;
        uint256 requestBlock;
    }

    function claim(uint256 _requestId) external;

    function getRequestIdsByUser(address _user) external view returns (uint256[] memory requestIds_);

    function requestWithdraw(uint256 _ethXAmount, address _owner) external returns (uint256 requestId_);

    function userWithdrawRequests(uint256 _requestId)
        external
        view
        returns (UserWithdrawInfo memory userWithdrawInfo_);
}
