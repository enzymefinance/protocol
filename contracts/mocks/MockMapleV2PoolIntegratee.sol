// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./MockToken.sol";
import "./MockMapleV2PoolManagerIntegratee.sol";
import "./MockMapleV2WithdrawalManagerIntegratee.sol";

/// @title MockMapleV2PoolIntegratee Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An integratee that simulates interactions with MapleV2 Pools
contract MockMapleV2PoolIntegratee is MockToken {
    uint256 private constant SHARES_TO_ASSETS_RATE_MULTIPLE = 5;
    uint256 private constant SHARES_TO_ASSETS_EXIT_SLIPPAGE_PERCENT = 2;
    uint256 private constant ONE_HUNDRED_PERCENT = 100;

    address public asset;
    address public manager;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) public MockToken(_name, _symbol, _decimals) {
        manager = address(new MockMapleV2PoolManagerIntegratee(address(this)));
    }

    function convertToAssets(uint256 _poolTokenAmount)
        public
        pure
        returns (uint256 liquidityAssetAmount_)
    {
        return _poolTokenAmount * SHARES_TO_ASSETS_RATE_MULTIPLE;
    }

    function convertToExitAssets(uint256 _poolTokenAmount)
        public
        pure
        returns (uint256 liquidityAssetAmount_)
    {
        // Simulates unrealized losses
        return
            (convertToAssets(_poolTokenAmount) *
                (ONE_HUNDRED_PERCENT - SHARES_TO_ASSETS_EXIT_SLIPPAGE_PERCENT)) /
            ONE_HUNDRED_PERCENT;
    }

    function convertToExitShares(uint256 _liquidityAssetAmount)
        public
        pure
        returns (uint256 poolTokenAmount_)
    {
        // Simulates unrealized losses
        return ((convertToShares(_liquidityAssetAmount) * ONE_HUNDRED_PERCENT) /
            (ONE_HUNDRED_PERCENT - SHARES_TO_ASSETS_EXIT_SLIPPAGE_PERCENT));
    }

    function convertToShares(uint256 _assetAmount) public pure returns (uint256 poolTokenAmount_) {
        return _assetAmount / SHARES_TO_ASSETS_RATE_MULTIPLE;
    }

    function deposit(uint256 _liquidityAssetAmount, address)
        external
        returns (uint256 poolTokenAmount_)
    {
        ERC20(asset).transferFrom(msg.sender, address(this), _liquidityAssetAmount);

        poolTokenAmount_ = convertToShares(_liquidityAssetAmount);
        _mint(msg.sender, poolTokenAmount_);

        return poolTokenAmount_;
    }

    function redeem(
        uint256 _poolTokenAmount,
        address _receiver,
        address
    ) external returns (uint256 assetAmount_) {
        _burn(__getWithdrawalManager(), _poolTokenAmount);

        assetAmount_ = convertToExitAssets(_poolTokenAmount);

        ERC20(asset).transfer(_receiver, assetAmount_);

        return assetAmount_;
    }

    function removeShares(uint256 _poolTokenAmount, address _owner) external {
        _transfer(__getWithdrawalManager(), _owner, _poolTokenAmount);
    }

    function requestRedeem(uint256 _poolTokenAmount, address _owner) external {
        _transfer(_owner, __getWithdrawalManager(), _poolTokenAmount);
    }

    function setAsset(address _asset) public {
        asset = _asset;
    }

    function __getWithdrawalManager() private view returns (address withdrawalManager_) {
        return MockMapleV2PoolManagerIntegratee(manager).withdrawalManager();
    }
}
