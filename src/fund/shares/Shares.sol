pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "../../dependencies/TokenUser.sol";
import "../../dependencies/libs/EnumerableSet.sol";
import "../../prices/IDerivativePriceSource.sol";
import "../../prices/IPriceSource.sol";
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
        address investmentAsset,
        uint256 investmentAmount
    );

    event SharesInvestmentAssetsDisabled (address[] assets);

    event SharesInvestmentAssetsEnabled (address[] assets);

    event SharesRedeemed(
        address indexed redeemer,
        uint256 sharesQuantity,
        address[] receivedAssets,
        uint256[] receivedAssetQuantities
    );

    address public DENOMINATION_ASSET;
    EnumerableSet.AddressSet private sharesInvestmentAssets;

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
        address[] memory _defaultAssets,
        string memory _tokenName
    )
        public
        Spoke(_hub)
        SharesToken(_tokenName)
    {
        require(
            __getRegistry().assetIsRegistered(_denominationAsset),
            "Denomination asset must be registered"
        );
        DENOMINATION_ASSET = _denominationAsset;

        if (_defaultAssets.length > 0) {
            __enableSharesInvestmentAssets(_defaultAssets);
        }
    }

    // EXTERNAL

    /// @notice Buy shares on behalf of a specified user
    /// @dev Only callable by the SharesRequestor associated with the Registry
    /// @dev Rewards all fees via getSharesCostInAsset
    /// @param _buyer The for which to buy shares
    /// @param _investmentAsset The asset with which to buy shares
    /// @param _sharesQuantity The desired amount of shares
    /// @return costInInvestmentAsset_ The amount of investment asset used to buy the desired shares
    function buyShares(
        address _buyer,
        address _investmentAsset,
        uint256 _sharesQuantity
    )
        external
        override
        onlySharesRequestor
        returns (uint256 costInInvestmentAsset_)
    {
        costInInvestmentAsset_ = getSharesCostInAsset(_sharesQuantity, _investmentAsset);

        // Issue shares and transfer investment asset to vault
        address vaultAddress = address(__getVault());
        _mint(_buyer, _sharesQuantity);
        __safeTransferFrom(_investmentAsset, msg.sender, address(this), costInInvestmentAsset_);
        __increaseApproval(_investmentAsset, vaultAddress, costInInvestmentAsset_);
        IVault(vaultAddress).deposit(_investmentAsset, costInInvestmentAsset_);

        emit SharesBought(
            _buyer,
            _sharesQuantity,
            _investmentAsset,
            costInInvestmentAsset_
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

    /// @notice Disable the buying of shares with specific assets
    /// @param _assets The assets for which to disable the buying of shares
    function disableSharesInvestmentAssets(address[] calldata _assets) external onlyManager {
        require(_assets.length > 0, "disableSharesInvestmentAssets: _assets cannot be empty");

        for (uint256 i = 0; i < _assets.length; i++) {
            require(
                isSharesInvestmentAsset(_assets[i]),
                "disableSharesInvestmentAssets: Asset is not enabled"
            );
            EnumerableSet.remove(sharesInvestmentAssets, _assets[i]);
        }
        emit SharesInvestmentAssetsDisabled(_assets);
    }

    /// @notice Enable the buying of shares with specific assets
    /// @param _assets The assets for which to disable the buying of shares
    function enableSharesInvestmentAssets(address[] calldata _assets) external onlyManager {
        require(_assets.length > 0, "enableSharesInvestmentAssets: _assets cannot be empty");
        __enableSharesInvestmentAssets(_assets);
    }

    /// @notice Get all assets that can be used to buy shares
    /// @return The assets that can be used to buy shares
    function getSharesInvestmentAssets() external view returns (address[] memory) {
        return EnumerableSet.enumerate(sharesInvestmentAssets);
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

    function calcAssetGav(address _asset) public view returns (uint256) {
        IRegistry registry = __getRegistry();
        // TODO: Is it a problem if this fails?
        require(
            registry.assetIsRegistered(_asset) ||
            registry.derivativeToPriceSource(_asset) != address(0),
            "calcAssetGav: _asset has no price source"
        );

        address gavAsset;
        uint256 gavAssetAmount;
        uint256 assetBalance = __getVault().assetBalances(_asset);

        // If asset in registry, get asset from priceSource
        if (registry.assetIsRegistered(_asset)) {
            gavAsset = _asset;
            gavAssetAmount = assetBalance;
        }
        // Else use derivative oracle to get price
        else {
            address derivativePriceSource = registry.derivativeToPriceSource(_asset);
            uint256 price;
            (gavAsset, price) = IDerivativePriceSource(derivativePriceSource).getPrice(_asset);

            gavAssetAmount = mul(
                price,
                assetBalance
            ) / 10 ** uint256(ERC20WithFields(_asset).decimals());
        }

        return __getPriceSource().convertQuantity(
            gavAssetAmount,
            gavAsset,
            DENOMINATION_ASSET
        );
    }

    /// @notice Calculate the overall GAV of the fund
    /// @return gav_ The fund GAV
    function calcGav() public view returns (uint256) {
        address[] memory assets = __getVault().getOwnedAssets();

        uint256 gav;
        for (uint256 i = 0; i < assets.length; i++) {
            // TODO: is this way too expensive b/c up to 20 calls to vault?; 2000n gas?
            gav = add(gav, calcAssetGav(assets[i]));
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

        if (_asset != DENOMINATION_ASSET) {
            return __getPriceSource().convertQuantity(
                denominationAssetQuantity, DENOMINATION_ASSET, _asset
            );
        }

        return denominationAssetQuantity;
    }

    /// @notice Confirm whether asset can be used to buy shares
    /// @param _asset The asset to confirm
    /// @return True if the asset can be used to buy shares
    function isSharesInvestmentAsset(address _asset) public view override returns (bool) {
        return EnumerableSet.contains(sharesInvestmentAssets, _asset);
    }

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

            try IERC20Flexible(payoutAssets[i]).transfer(msg.sender, payoutQuantities[i]) {}
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

    /// @notice Enable assets with which to buy shares
    function __enableSharesInvestmentAssets (address[] memory _assets) private {
        for (uint256 i = 0; i < _assets.length; i++) {
            require(
                !isSharesInvestmentAsset(_assets[i]),
                "__enableSharesInvestmentAssets: Asset is already enabled"
            );
            require(
                __getRegistry().assetIsRegistered(_assets[i]),
                "__enableSharesInvestmentAssets: Asset not in Registry"
            );
            EnumerableSet.add(sharesInvestmentAssets, _assets[i]);
        }
        emit SharesInvestmentAssetsEnabled(_assets);
    }
}

contract SharesFactory {
    function createInstance(
        address _hub,
        address _denominationAsset,
        address[] calldata _defaultAssets,
        string calldata _tokenName
    )
        external
        returns (address)
    {
        return address(new Shares(_hub, _denominationAsset, _defaultAssets, _tokenName));
    }
}
