// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IMerklDistributor interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IMerklDistributor {
    function claim(
        address[] calldata _users,
        address[] calldata _tokens,
        uint256[] calldata _amounts,
        bytes32[][] calldata _proofs
    ) external;

    function claimed(address _user, address _token) external view returns (uint256 amount_);
}
