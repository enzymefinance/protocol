pragma solidity ^0.4.21;

import "Spoke.sol";

/// @dev Balances are fake and can be set by anyone (testing)
contract MockAccounting is Spoke {

    uint public gav;
    uint public nav;
    uint public unclaimedFees;
    uint public valuePerShare;

    address[] public ownedAssets;
    mapping (address => bool) public isInAssetList;
    mapping (address => uint) public held; // mock total held across all components
    mapping (address => uint) public assetGav;
    address public QUOTE_ASSET;
    address public NATIVE_ASSET;
    uint public DEFAULT_SHARE_PRICE;
    uint public SHARES_DECIMALS;

    constructor(address _hub, address _quoteAsset, address _nativeAsset, address[] _defaultAssets)
        Spoke(_hub)
    {
        setOwnedAssets(_defaultAssets);
        QUOTE_ASSET = _quoteAsset;
        NATIVE_ASSET = _nativeAsset;
        SHARES_DECIMALS = 18;
        DEFAULT_SHARE_PRICE = 10 ** SHARES_DECIMALS;
    }

    function setOwnedAssets(address[] _assets) { ownedAssets = _assets; }
    function getOwnedAssetsLength() returns (uint) { return ownedAssets.length; }
    function setGav(uint _gav) { gav = _gav; }
    function setNav(uint _nav) { nav = _nav; }
    function setAssetGAV(address _asset, uint _amt) { assetGav[_asset] = _amt; }
    function setFundHoldings(uint[] _amounts, address[] _assets) {
        for (uint i = 0; i < _assets.length; i++) {
            held[_assets[i]] = _amounts[i];
        }
    }

    function getFundHoldings() returns (uint[], address[]) {
        uint[] memory _quantities = new uint[](ownedAssets.length);
        address[] memory _assets = new address[](ownedAssets.length);
        for (uint i = 0; i < ownedAssets.length; i++) {
            address ofAsset = ownedAssets[i];
            // holdings formatting: mul(exchangeHoldings, 10 ** assetDecimal)
            uint quantityHeld = held[ofAsset];

            if (quantityHeld != 0) {
                _assets[i] = ofAsset;
                _quantities[i] = quantityHeld;
            }
        }
        return (_quantities, _assets);
    }

    function calcGav() public returns (uint) { return gav; }
    function calcNav() public returns (uint) { return nav; }

    function calcAssetGAV(address _a) returns (uint) { return assetGav[_a]; }

    function calcValuePerShare(uint totalValue, uint numShares) view returns (uint) {
        return valuePerShare;
    }

    function performCalculations() view returns (uint, uint, uint, uint, uint) {
        return (gav, unclaimedFees, 0, nav, valuePerShare);
    }

    function calcSharePrice() view returns (uint sharePrice) {
        (,,,,sharePrice) = performCalculations();
        return sharePrice;
    }
}
