pragma solidity ^0.4.21;

import "../../pricefeeds/CanonicalPriceFeed.sol";
import "../Manager.sol";
import "../Policy.sol";
import "../../risk-management/PriceTolerance.sol";

contract MockFund is PolicyManager {
    struct Modules {
        CanonicalPriceFeed pricefeed;
    }

    Modules public modules;

    function getModules() view returns (address, address, address) {
        return (
            address(modules.pricefeed),
            address(modules.pricefeed),
            address(modules.pricefeed)
        );
    }
    
    function setPriceFeed(address _pricefeed) public {
        modules.pricefeed = CanonicalPriceFeed(_pricefeed);
    }
    
    uint private fundHoldingsLength;

    function setFundHoldingsLength(uint _length) public {
        fundHoldingsLength = _length;
    } 

    function getFundHoldingsLength() public view returns (uint) {
        return fundHoldingsLength;
    }
    
    function testSomePolicy(address[4] addresses, uint[2] values, address _ofPolicy) public view returns (bool) {
        return Policy(_ofPolicy).rule(addresses, values);
    }
    
    function testMaxPositions(address[4] addresses, uint[2] values, uint _value) public isValidPolicy(addresses, values) {
        setFundHoldingsLength(_value);
    }

    mapping (address => uint) gavs;

    function setAssetGav(address _ofAsset, uint _gav) public {
        gavs[_ofAsset] = _gav;
    }

    function calcAssetGAV(address _ofAsset) public view returns (uint) {
        return gavs[_ofAsset];
    }
    
    uint gav;

    function setCalcGav(uint _gav) public {
        gav = _gav;
    }

    function calcGav() public view returns (uint) {
        return gav;
    }

    function testPolicy(address[4] addresses, uint[2] values) public view 
        isValidPolicy(addresses, values) 
    {
        // dummy
    }

    // -- price tolerance
    function testPriceTolerance(address _ofPolicy, address _asset, address _quote, uint _value) view returns (uint, uint, uint, uint, uint, uint, bool) {
        return PriceTolerance(_ofPolicy).apply(_asset, _quote, _value);
    }
}
