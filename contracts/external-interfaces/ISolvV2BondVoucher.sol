// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;
pragma experimental ABIEncoderV2;

import "./ISolvV2BondPool.sol";

/// @title ISolvV2BondVoucher Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @dev Source: https://github.com/solv-finance/solv-v2-ivo/blob/main/vouchers/bond-voucher/contracts/BondVoucher.sol
interface ISolvV2BondVoucher {
    function approve(address _to, uint256 _tokenId) external;

    function bondPool() external view returns (address bondPool_);

    function claimTo(uint256 _tokenId, address _to, uint256 _claimUnits) external;

    function getSlot(
        address _issuer,
        address _fundCurrency,
        uint128 _lowestPrice,
        uint128 _highestPrice,
        uint64 _effectiveTime,
        uint64 _maturity
    ) external view returns (uint256 slot_);

    function getSlotDetail(uint256 _slot) external view returns (ISolvV2BondPool.SlotDetail memory slotDetail_);

    function nextTokenId() external view returns (uint32 nextTokenId_);

    function ownerOf(uint256 _tokenId) external view returns (address owner_);

    function slotOf(uint256 _tokenId) external view returns (uint256 slotId_);

    function underlying() external view returns (address underlying_);

    function unitsInToken(uint256 tokenId_) external view returns (uint256 units_);

    function voucherSlotMapping(uint256 _tokenId) external returns (uint256 slotId_);
}
