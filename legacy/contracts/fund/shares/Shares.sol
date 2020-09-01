// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../interfaces/IERC20Flexible.sol";
import "../../prices/IValueInterpreter.sol";
import "../hub/Spoke.sol";
import "./IShares.sol";
import "./SharesToken.sol";

/// @title Shares Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Buy and sell shares for a Melon fund
contract Shares is IShares, Spoke, SharesToken {
    using SafeMath for uint256;
    using SafeERC20 for ERC20;

    event SharesBought(address indexed buyer, uint256 sharesQuantity, uint256 investmentAmount);

    event SharesRedeemed(
        address indexed redeemer,
        uint256 sharesQuantity,
        address[] receivedAssets,
        uint256[] receivedAssetQuantities
    );

    address public immutable override DENOMINATION_ASSET;

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
    ) public Spoke(_hub) SharesToken(_tokenName) {
        require(
            __getRegistry().primitiveIsRegistered(_denominationAsset),
            "Denomination asset must be registered"
        );
        DENOMINATION_ASSET = _denominationAsset;
    }

    // EXTERNAL

    /// @notice Burn shares
    /// @param _target The account from which to burn
    /// @param _amount The amount of shares to burn
    function burn(address _target, uint256 _amount) external override onlyFeeManager {
        _burn(_target, _amount);
    }

    /// @notice Buy shares on behalf of a specified user
    /// @dev Only callable by the SharesRequestor associated with the Registry
    /// @param _buyer The for which to buy shares
    /// @param _investmentAmount The amount of the fund's denomination asset with which to buy shares
    /// @param _minSharesQuantity The minimum quantity of shares to buy with the specified _investmentAmount
    /// @return The amount of shares bought
    function buyShares(
        address _buyer,
        uint256 _investmentAmount,
        uint256 _minSharesQuantity
    ) external override onlySharesRequestor onlyActiveFund returns (uint256) {
        IFeeManager feeManager = __getFeeManager();

        // Calculate full shares quantity for investment amount after updating continuous fees
        feeManager.settleFees(IFeeManager.FeeHook.Continuous, "");
        uint256 sharesQuantity = _investmentAmount
            .mul(10**uint256(ERC20(DENOMINATION_ASSET).decimals()))
            .div(calcSharePrice());

        // This is inefficient to mint, and then allow the feeManager to burn/mint to settle the fee,
        // but we need the FeeManager to handle minting/burning of shares if we want to move
        // to a modular system.
        uint256 prevBuyerShares = balanceOf(_buyer);
        _mint(_buyer, sharesQuantity);

        // Post-buy actions
        feeManager.settleFees(
            IFeeManager.FeeHook.BuyShares,
            abi.encode(_buyer, _investmentAmount, sharesQuantity)
        );
        uint256 sharesBought = balanceOf(_buyer).sub(prevBuyerShares);
        require(sharesBought >= _minSharesQuantity, "buyShares: minimum shares quantity not met");

        // Transfer investment asset
        // TODO: This is inefficient, two unnecessary steps now that we don't use internal accounting.
        // Revisit after we have upgradable funds implemented.
        address vaultAddress = address(__getVault());
        ERC20(DENOMINATION_ASSET).safeTransferFrom(msg.sender, address(this), _investmentAmount);
        ERC20(DENOMINATION_ASSET).safeIncreaseAllowance(vaultAddress, _investmentAmount);
        IVault(vaultAddress).deposit(DENOMINATION_ASSET, _investmentAmount);

        emit SharesBought(_buyer, sharesBought, _investmentAmount);

        return sharesBought;
    }

    /// @notice Mint shares
    /// @param _target The account from which to burn
    /// @param _amount The amount of shares to burn
    function mint(address _target, uint256 _amount) external override onlyFeeManager {
        _mint(_target, _amount);
    }

    /// @notice Redeem all of the sender's shares for a proportionate slice of the fund's assets
    function redeemShares() external {
        __redeemShares(balanceOf(msg.sender), false);
    }

    /// @notice Redeem all of the sender's shares for a proportionate slice of the fund's assets
    /// @dev _bypassFailure is set to true, the user will lose their claim to any assets for
    /// which the transfer function fails.
    function redeemSharesEmergency() external {
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
            (uint256 assetGav, bool isValid) = valueInterpreter.calcCanonicalAssetValue(
                assets[i],
                balances[i],
                DENOMINATION_ASSET
            );
            require(assetGav > 0 && isValid, "calcGav: No valid price available for asset");

            gav = gav.add(assetGav);
        }

        return gav;
    }

    /// @notice Calculates the cost of 1 unit of shares in the fund's denomination asset
    /// @return The amount of the denomination asset required to buy 1 unit of shares
    /// @dev Does not account for fees.
    /// Rounding favors the investor (rounds the price down).
    function calcSharePrice() public returns (uint256) {
        if (totalSupply() == 0) {
            return 10**uint256(ERC20(DENOMINATION_ASSET).decimals());
        } else {
            return calcGav().mul(10**uint256(decimals())).div(totalSupply());
        }
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

        // Attempt to settle fees, but don't allow an error to block redemption
        // This also handles a rejection from onlyActiveFund when the fund is shutdown
        try __getFeeManager().settleFees(IFeeManager.FeeHook.Continuous, "")  {} catch {}

        // Check the shares quantity against the user's balance after settling fees
        require(
            _sharesQuantity <= balanceOf(msg.sender),
            "__redeemShares: _sharesQuantity exceeds sender balance"
        );

        IVault vault = __getVault();
        address[] memory payoutAssets = vault.getOwnedAssets();
        require(payoutAssets.length > 0, "__redeemShares: payoutAssets is empty");

        // Destroy the shares
        uint256 sharesSupply = totalSupply();
        _burn(msg.sender, _sharesQuantity);

        // Calculate and transfer payout assets to redeemer
        uint256[] memory assetBalances = vault.getAssetBalances(payoutAssets);
        uint256[] memory payoutQuantities = new uint256[](payoutAssets.length);
        for (uint256 i = 0; i < payoutAssets.length; i++) {
            // Redeemer's ownership percentage of asset holdings
            payoutQuantities[i] = assetBalances[i].mul(_sharesQuantity).div(sharesSupply);

            // Transfer payout asset to redeemer
            try vault.withdraw(payoutAssets[i], payoutQuantities[i])  {} catch {}

            uint256 receiverPreBalance = ERC20(payoutAssets[i]).balanceOf(msg.sender);
            try IERC20Flexible(payoutAssets[i]).transfer(msg.sender, payoutQuantities[i])  {
                uint256 receiverPostBalance = ERC20(payoutAssets[i]).balanceOf(msg.sender);
                require(
                    receiverPreBalance.add(payoutQuantities[i]) == receiverPostBalance,
                    "__redeemShares: Receiver did not receive tokens in transfer"
                );
            } catch {
                if (!_bypassFailure) {
                    revert("__redeemShares: Token transfer failed");
                }
            }
        }

        emit SharesRedeemed(msg.sender, _sharesQuantity, payoutAssets, payoutQuantities);
    }
}

contract SharesFactory {
    function createInstance(
        address _hub,
        address _denominationAsset,
        string calldata _tokenName
    ) external returns (address) {
        return address(new Shares(_hub, _denominationAsset, _tokenName));
    }
}
