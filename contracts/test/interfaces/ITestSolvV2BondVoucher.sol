// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "./ITestSolvV2BondPool.sol";

/// @title ITestSolvV2BondVoucher Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A test interface for Solv V2 Bond Pool
/// @dev Source: https://github.com/solv-finance/solv-v2-ivo/blob/main/vouchers/bond-voucher/contracts/BondVoucher.sol
interface ITestSolvV2BondVoucher {
    function approve(address _to, uint256 _tokenId) external;

    function getSlot(
        address _issuer,
        address _fundCurrency,
        uint128 _lowestPrice,
        uint128 _highestPrice,
        uint64 _effectiveTime,
        uint64 _maturity
    ) external view returns (uint256 slot_);

    function getSlotDetail(uint256 _slot)
        external
        view
        returns (ITestSolvV2BondPool.SlotDetail memory slotDetail_);

    function ownerOf(uint256 _tokenId) external view returns (address owner_);
}
