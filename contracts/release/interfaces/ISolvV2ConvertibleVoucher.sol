// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "./ISolvV2ConvertiblePool.sol";

/// @title ISolvV2ConvertibleVoucher Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @dev Source: https://github.com/solv-finance/solv-v2-ivo/blob/main/vouchers/convertible-voucher/contracts/ConvertibleVoucher.sol
interface ISolvV2ConvertibleVoucher {
    function approve(address _to, uint256 _tokenId) external;

    function convertiblePool() external view returns (address convertiblePool_);

    function claimTo(
        uint256 _tokenId,
        address _to,
        uint256 _claimUnits
    ) external;

    function getSlot(
        address _issuer,
        address _fundCurrency,
        uint128 _lowestPrice,
        uint128 _highestPrice,
        uint64 _effectiveTime,
        uint64 _maturity,
        uint8 _collateralType
    ) external view returns (uint256 slot_);

    function getSlotDetail(uint256 _slot)
        external
        view
        returns (ISolvV2ConvertiblePool.SlotDetail memory slotDetail_);

    function nextTokenId() external view returns (uint32 nextTokenId_);

    function ownerOf(uint256 _tokenId) external view returns (address owner_);

    function voucherSlotMapping(uint256 _tokenId) external view returns (uint256 slotId_);

    function underlying() external view returns (address underlying_);

    function unitsInToken(uint256 tokenId_) external view returns (uint256 units_);
}
