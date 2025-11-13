// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {AddOnUtilsBase} from "tests/utils/bases/AddOnUtilsBase.sol";

import {ICurvePriceFeed} from "tests/interfaces/internal/ICurvePriceFeed.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";

abstract contract CurveUtils is AddOnUtilsBase {
    address internal constant ADDRESS_PROVIDER_ADDRESS = 0x0000000022D53366457F9d5E68Ec105046FC4383;

    address internal constant ETHEREUM_GAUGE_CONTROLLER_ADDRESS = 0x2F50D538606Fa9EDD2B11E2446BEb18C9D5846bB;
    // ETHEREUM_GAUGE_CONTROLLER_ADMIN can change and can also be queried from ETHEREUM_GAUGE_CONTROLLER.admin()
    address internal constant ETHEREUM_GAUGE_CONTROLLER_ADMIN_ADDRESS = 0x40907540d8a6C65c637785e8f8B742ae6b0b9968;
    address internal constant ETHEREUM_MINTER_ADDRESS = 0xd061D61a4d941c39E5453435B6345Dc261C2fcE0;
    address internal constant ETHEREUM_POOL_OWNER_ADDRESS = 0xeCb456EA5365865EbAb8a2661B0c503410e9B347;
    address internal constant POLYGON_POOL_OWNER_ADDRESS = 0x774D1Dba98cfBD1F2Bc3A1F59c494125e07C48F9;
    address internal constant ARBITRUM_POOL_OWNER_ADDRESS = 0xd4F94D0aaa640BBb72b5EEc2D85F6D114D81a88E;

    // Pools: Ethereum
    // underlyings (aave-style)
    address internal constant ETHEREUM_AAVE_POOL_ADDRESS = 0xDeBF20617708857ebe4F679508E7b7863a8A8EeE;
    address internal constant ETHEREUM_AAVE_POOL_GAUGE_TOKEN_ADDRESS = 0xd662908ADA2Ea1916B3318327A97eB18aD588b5d;
    address internal constant ETHEREUM_AAVE_POOL_LP_TOKEN_ADDRESS = 0xFd2a8fA60Abd58Efe3EeE34dd494cD491dC14900;
    // native asset
    address internal constant ETHEREUM_STETH_NG_POOL_ADDRESS = 0x21E27a5E5513D6e65C4f830167390997aA84843a;
    address internal constant ETHEREUM_STETH_NG_POOL_GAUGE_TOKEN_ADDRESS = 0x79F21BC30632cd40d2aF8134B469a0EB4C9574AA;
    address internal constant ETHEREUM_STETH_NG_POOL_LP_TOKEN_ADDRESS = 0x21E27a5E5513D6e65C4f830167390997aA84843a;
    // metapool
    address internal constant ETHEREUM_META_POOL_ADDRESS = 0xB30dA2376F63De30b42dC055C93fa474F31330A5;
    address internal constant ETHEREUM_META_POOL_GAUGE_TOKEN_ADDRESS = 0x740BA8aa0052E07b925908B380248cb03f3DE5cB;
    address internal constant ETHEREUM_META_POOL_LP_TOKEN_ADDRESS = 0xB30dA2376F63De30b42dC055C93fa474F31330A5;
    // basepool
    address internal constant ETHEREUM_BASE_POOL_ADDRESS = 0x0Ce6a5fF5217e38315f87032CF90686C96627CAA;
    address internal constant ETHEREUM_BASE_POOL_GAUGE_TOKEN_ADDRESS = 0x90Bb609649E0451E5aD952683D64BD2d1f245840;
    address internal constant ETHEREUM_BASE_POOL_LP_TOKEN_ADDRESS = 0x194eBd173F6cDacE046C53eACcE9B953F28411d1;

    // Pools: Polygon
    // underlyings (aave-style)
    address internal constant POLYGON_AAVE_POOL_ADDRESS = 0x445FE580eF8d70FF569aB36e80c647af338db351;
    address internal constant POLYGON_AAVE_POOL_GAUGE_TOKEN_ADDRESS = 0x19793B454D3AfC7b454F206Ffe95aDE26cA6912c;
    address internal constant POLYGON_AAVE_POOL_LP_TOKEN_ADDRESS = 0xE7a24EF0C5e95Ffb0f6684b813A78F2a3AD7D171;
    // metapool
    address internal constant POLYGON_META_POOL_ADDRESS = 0x53C38755748745e2dd7D0a136FBCC9fB1A5B83b2;
    address internal constant POLYGON_META_POOL_LP_TOKEN_ADDRESS = 0x53C38755748745e2dd7D0a136FBCC9fB1A5B83b2;
    // TODO: native asset

    // Pools: Arbitrum
    address internal constant ARBITRUM_2POOL_ADDRESS = 0x7f90122BF0700F9E7e1F688fe926940E8839F353;
    address internal constant ARBITRUM_2POOL_LP_TOKEN_ADDRESS = 0x7f90122BF0700F9E7e1F688fe926940E8839F353;

    function deployPriceFeed(
        IFundDeployer _fundDeployer,
        address _addressProviderAddress,
        address _poolOwnerAddress,
        uint256 _virtualPriceDeviationThreshold
    ) internal returns (ICurvePriceFeed priceFeed_) {
        bytes memory args = abi.encode(
            _fundDeployer, _addressProviderAddress, _poolOwnerAddress, _virtualPriceDeviationThreshold
        );

        return ICurvePriceFeed(deployCode("CurvePriceFeed.sol", args));
    }
}
