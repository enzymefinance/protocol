pragma solidity 0.6.4;

import "main/fund/hub/Spoke.sol";

/// @dev Balances are fake and can be set by anyone (testing)
contract MockAccounting is Spoke {

    uint public gav;
    uint public nav;
    uint public unclaimedFees;
    uint public mockValuePerShare;

    address[] public ownedAssets;
    mapping (address => uint) public held; // mock total held across all components
    mapping (address => uint) public assetGav;
    address public DENOMINATION_ASSET;
    uint public DEFAULT_SHARE_PRICE;

    constructor(
        address _hub,
        address _denominationAsset,
        address _registry
    )
        public
        Spoke(_hub)
    {
        DENOMINATION_ASSET = _denominationAsset;
        DEFAULT_SHARE_PRICE = 10 ** 18;
    }

    function setOwnedAssets(address[] memory _assets) public { ownedAssets = _assets; }
    function getOwnedAssetsLength() public view returns (uint) { return ownedAssets.length; }
    function setGav(uint _gav) public { gav = _gav; }
    function setNav(uint _nav) public { nav = _nav; }
    function setAssetGAV(address _asset, uint _amt) public { assetGav[_asset] = _amt; }
    function setFundHoldings(uint[] memory _amounts, address[] memory _assets) public {
        for (uint i = 0; i < _assets.length; i++) {
            held[_assets[i]] = _amounts[i];
        }
    }

    function getFundHoldings() public view returns (uint[] memory, address[] memory) {
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

    function calcGav() public view returns (uint) { return gav; }
    function calcNav() public view returns (uint) { return nav; }

    function calcAssetGav(address _a) public view returns (uint) { return assetGav[_a]; }

    function valuePerShare(uint totalValue, uint numShares) public view returns (uint) {
        return mockValuePerShare;
    }

    function calcFundMetrics() public view returns (uint, uint, uint, uint, uint) {
        return (gav, unclaimedFees, 0, nav, mockValuePerShare);
    }
}
