// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

contract MockOracle {
    mapping(address => mapping(address => uint256)) public prices;

    error MockOracle__PriceNotAvailable();

    function setPrice(address _token, address _quoteToken, uint256 _price) external {
        prices[_token][_quoteToken] = _price;
    }

    function getPrice(address _token, address _quoteToken, bytes[] memory) external view returns (uint256 price_) {
        price_ = prices[_token][_quoteToken];

        if (price_ == 0) {
            revert MockOracle__PriceNotAvailable();
        }

        return price_;
    }
}
