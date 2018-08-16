pragma solidity ^0.4.21;

import "../../pricefeeds/CanonicalPriceFeed.sol";
import "../Manager.sol";
import "../Policy.sol";
import "../../risk-management/MaxConcentration.sol";

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
    
    function testSomePolicy(address[5] addresses, uint[3] values, address _ofPolicy) public view returns (bool) {
        return Policy(_ofPolicy).rule(0x0000, addresses, values, 0x0);
    }
    
    function testMaxPositions(address[5] addresses, uint[3] values, uint _value) public 
        isValidPolicy(addresses, values, 0x0) 
    {
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
    
    function testPolicy(address[5] addresses, uint[3] values) public view 
        isValidPolicy(addresses, values, 0x0)
    {
        // dummy
    }
}
