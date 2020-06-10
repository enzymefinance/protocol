// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "../../dependencies/TokenUser.sol";
import "../../dependencies/libs/EnumerableSet.sol";
import "../../prices/IValueInterpreter.sol";
import "../hub/Spoke.sol";
import "./IShares.sol";
import "./SharesToken.sol";

/// @title Shares Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Buy and sell shares for a Melon fund
contract Shares is IShares, TokenUser, Spoke, SharesToken {
    using EnumerableSet for EnumerableSet.AddressSet;

    event SharesBought(
        address indexed buyer,
        uint256 sharesQuantity,
        address denominationAsset,
        uint256 investmentAmount
    );

    event SharesRedeemed(
        address indexed redeemer,
        uint256 sharesQuantity,
        address[] receivedAssets,
        uint256[] receivedAssetQuantities
    );

    address public DENOMINATION_ASSET;

    modifier onlySharesRequestor() {
        require(
            msg.sender == __getRegistry().sharesRequestor(),
            "Only SharesRequestor can call this function"
        );
        _;
    }

    constructor(
        address _hub,
        address _denominationAsset,
        string memory _tokenName
    )
        public
        Spoke(_hub)
        SharesToken(_tokenName)
    {
        require(
            __getRegistry().primitiveIsRegistered(_denominationAsset),
            "Denomination asset must be registered"
        );
        DENOMINATION_ASSET = _denominationAsset;
    }

    // EXTERNAL

    /// @notice Buy shares on behalf of a specified user
    /// @dev Only callable by the SharesRequestor associated with the Registry
    /// @dev Rewards all fees via getSharesCostInAsset
    /// @param _buyer The for which to buy shares
    /// @param _sharesQuantity The desired amount of shares
    /// @return costInDenominationAsset The amount of investment asset used to buy the desired shares
    function buyShares(
        address _buyer,
        uint256 _sharesQuantity
    )
        external
        override
        onlySharesRequestor
        returns (uint256 costInDenominationAsset)
    {
        costInDenominationAsset = getSharesCostInAsset(_sharesQuantity, DENOMINATION_ASSET);

        // Issue shares and transfer investment asset to vault
        address vaultAddress = address(__getVault());
        _mint(_buyer, _sharesQuantity);
        __safeTransferFrom(DENOMINATION_ASSET, msg.sender, address(this), costInDenominationAsset);
        __increaseApproval(DENOMINATION_ASSET, vaultAddress, costInDenominationAsset);
        IVault(vaultAddress).deposit(DENOMINATION_ASSET, costInDenominationAsset);

        emit SharesBought(
            _buyer,
            _sharesQuantity,
            DENOMINATION_ASSET,
            costInDenominationAsset
        );
    }

    // TODO: remove this after FeeManager arch changes
    function createFor(address _who, uint256 _amount) external override {
        require(
            msg.sender == address(__getFeeManager()),
            "Only FeeManager can call this function"
        );

        _mint(_who, _amount);
    }

    /// @notice Redeem all of the sender's shares for a proportionate slice of the fund's assets
    /// @dev Rewards all fees prior to redemption
    function redeemShares() external {
        // Duplicates logic further down call stack, but need to assure all outstanding shares are
        // assigned for fund manager (and potentially other fee recipients in the future)
        __getFeeManager().rewardAllFees();
        __redeemShares(balanceOf(msg.sender), false);
    }

    /// @notice Redeem all of the sender's shares for a proportionate slice of the fund's assets
    /// @dev _bypassFailure is set to true, the user will lose their claim to any assets for
    /// which the transfer function fails.
    function redeemSharesEmergency() external {
        __getFeeManager().rewardAllFees();
        __redeemShares(balanceOf(msg.sender), true);
    }

    /// @notice Redeem a specified quantity of the sender's shares
    /// for a proportionate slice of the fund's assets
    /// @param _sharesQuantity Number of shares
    function redeemSharesQuantity(uint256 _sharesQuantity) external {
        __redeemShares(_sharesQuantity, false);
    }

    // PUBLIC FUNCTIONS

    /// @notice Calculate the overall GAV of the fund
    /// @return gav_ The fund GAV
    function calcGav() public returns (uint256) {
        IVault vault = __getVault();
        IValueInterpreter valueInterpreter = __getValueInterpreter();
        address[] memory assets = vault.getOwnedAssets();
        uint256[] memory balances = vault.getAssetBalances(assets);

        uint256 gav;
        for (uint256 i = 0; i < assets.length; i++) {
            (
                uint256 assetGav,
                bool isValid
            ) = valueInterpreter.calcCanonicalAssetValue(
                assets[i],
                balances[i],
                DENOMINATION_ASSET
            );
            require(assetGav > 0 && isValid, "calcGav: No valid price available for asset");

            gav = add(gav, assetGav);
        }

        return gav;
    }

    /// @notice Calculate the cost for a given number of shares in the fund, in a given asset
    /// @dev Rewards all fees prior to calculations
    /// @param _sharesQuantity Number of shares
    /// @param _asset Asset in which to calculate share cost
    /// @return The amount of the asset required to buy the quantity of shares
    function getSharesCostInAsset(uint256 _sharesQuantity, address _asset)
        public
        override
        returns (uint256)
    {
        __getFeeManager().rewardAllFees();

        uint256 denominatedSharePrice;
        // TODO: Confirm that this is correct behavior when shares go above 0 and then return to 0 (all shares cashed out)
        if (totalSupply() == 0) {
            denominatedSharePrice = 10 ** uint256(ERC20WithFields(DENOMINATION_ASSET).decimals());
        }
        else {
            denominatedSharePrice = calcGav() * 10 ** uint256(decimals) / totalSupply();
        }

        // TOOD: does it matter if we do: cost of 1 share x quantity vs. GAV x shares / supply (b/c rounding)?
        // Because 1 share will be rounded down, and then multiplied, which could yield a slightly smaller number
        uint256 denominationAssetQuantity = mul(
            _sharesQuantity,
            denominatedSharePrice
        ) / 10 ** uint256(decimals);

        if (_asset == DENOMINATION_ASSET) return denominationAssetQuantity;

        (uint256 assetQuantity,) = __getValueInterpreter().calcCanonicalAssetValue(
            DENOMINATION_ASSET,
            denominationAssetQuantity,
            _asset
        );
        return assetQuantity;
    }

    // PRIVATE FUNCTIONS

    /// @notice Redeem a specified quantity of the sender's shares
    /// for a proportionate slice of the fund's assets
    /// @dev If _bypassFailure is set to true, the user will lose their claim to any assets for
    /// which the transfer function fails. This should always be false unless explicitly intended
    /// @param _sharesQuantity The amount of shares to redeem
    /// @param _bypassFailure True if token transfer failures should be ignored and forfeited
    function __redeemShares(uint256 _sharesQuantity, bool _bypassFailure) private {
        require(_sharesQuantity > 0, "__redeemShares: _sharesQuantity must be > 0");
        require(
            _sharesQuantity <= balanceOf(msg.sender),
            "__redeemShares: _sharesQuantity exceeds sender balance"
        );

        IVault vault = __getVault();
        address[] memory payoutAssets = vault.getOwnedAssets();
        require(payoutAssets.length > 0, "__redeemShares: payoutAssets is empty");

        __getFeeManager().rewardAllFees();

        // Destroy the shares
        uint256 sharesSupply = totalSupply();
        _burn(msg.sender, _sharesQuantity);

        // Calculate and transfer payout assets to redeemer
        uint256[] memory payoutQuantities = new uint256[](payoutAssets.length);
        for (uint256 i = 0; i < payoutAssets.length; i++) {
            uint256 quantityHeld = vault.assetBalances(payoutAssets[i]);
            // Redeemer's ownership percentage of asset holdings
            payoutQuantities[i] = mul(quantityHeld, _sharesQuantity) / sharesSupply;

            // Transfer payout asset to redeemer
            try vault.withdraw(payoutAssets[i], payoutQuantities[i]) {}
            catch {}

            uint256 receiverPreBalance = IERC20(payoutAssets[i]).balanceOf(msg.sender);
            try IERC20Flexible(payoutAssets[i]).transfer(msg.sender, payoutQuantities[i]) {
                uint256 receiverPostBalance = IERC20(payoutAssets[i]).balanceOf(msg.sender);
                require(
                    add(receiverPreBalance, payoutQuantities[i]) == receiverPostBalance,
                    "__redeemShares: Receiver did not receive tokens in transfer"
                );
            }
            catch {
                if (!_bypassFailure) {
                    revert("__redeemShares: Token transfer failed");
                }
            }
        }

        emit SharesRedeemed(
            msg.sender,
            _sharesQuantity,
            payoutAssets,
            payoutQuantities
        );
    }
}

contract SharesFactory {
    function createInstance(
        address _hub,
        address _denominationAsset,
        string calldata _tokenName
    )
        external
        returns (address)
    {
        return address(new Shares(_hub, _denominationAsset, _tokenName));
    }
}
