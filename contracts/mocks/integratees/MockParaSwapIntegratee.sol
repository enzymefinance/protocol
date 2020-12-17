// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../release/interfaces/IParaSwapAugustusSwapper.sol";
import "../prices/CentralizedRateProvider.sol";
import "../utils/SwapperBase.sol";

contract MockParaSwapIntegratee is SwapperBase {
    using SafeMath for uint256;

    address private immutable MOCK_CENTRALIZED_RATE_PROVIDER;

    // Deviation set in % defines the MAX deviation per block from the mean rate
    uint256 private blockNumberDeviation;

    constructor(address _mockCentralizedRateProvider, uint256 _blockNumberDeviation) public {
        MOCK_CENTRALIZED_RATE_PROVIDER = _mockCentralizedRateProvider;
        blockNumberDeviation = _blockNumberDeviation;
    }

    /// @dev Must be `public` to avoid error
    function multiSwap(
        address _fromToken,
        address _toToken,
        uint256 _fromAmount,
        uint256, // toAmount (min received amount)
        uint256, // expectedAmount
        IParaSwapAugustusSwapper.Path[] memory _paths,
        uint256, // mintPrice
        address, // beneficiary
        uint256, // donationPercentage
        string memory // referrer
    ) public payable returns (uint256) {
        return __multiSwap(_fromToken, _toToken, _fromAmount, _paths);
    }

    /// @dev Helper to parse the total amount of network fees (in ETH) for the multiSwap() call
    function __calcTotalNetworkFees(IParaSwapAugustusSwapper.Path[] memory _paths)
        private
        pure
        returns (uint256 totalNetworkFees_)
    {
        for (uint256 i; i < _paths.length; i++) {
            totalNetworkFees_ = totalNetworkFees_.add(_paths[i].totalNetworkFee);
        }

        return totalNetworkFees_;
    }

    /// @dev Helper to avoid the stack-too-deep error
    function __multiSwap(
        address _fromToken,
        address _toToken,
        uint256 _fromAmount,
        IParaSwapAugustusSwapper.Path[] memory _paths
    ) private returns (uint256) {
        address[] memory assetsFromIntegratee = new address[](1);
        assetsFromIntegratee[0] = _toToken;

        uint256[] memory assetsFromIntegrateeAmounts = new uint256[](1);
        assetsFromIntegrateeAmounts[0] = CentralizedRateProvider(MOCK_CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValueRandomized(_fromToken, _fromAmount, _toToken, blockNumberDeviation);

        uint256 totalNetworkFees = __calcTotalNetworkFees(_paths);
        address[] memory assetsToIntegratee;
        uint256[] memory assetsToIntegrateeAmounts;
        if (totalNetworkFees > 0) {
            assetsToIntegratee = new address[](2);
            assetsToIntegratee[1] = ETH_ADDRESS;

            assetsToIntegrateeAmounts = new uint256[](2);
            assetsToIntegrateeAmounts[1] = totalNetworkFees;
        } else {
            assetsToIntegratee = new address[](1);
            assetsToIntegrateeAmounts = new uint256[](1);
        }
        assetsToIntegratee[0] = _fromToken;
        assetsToIntegrateeAmounts[0] = _fromAmount;

        __swap(
            msg.sender,
            assetsToIntegratee,
            assetsToIntegrateeAmounts,
            assetsFromIntegratee,
            assetsFromIntegrateeAmounts
        );

        return assetsFromIntegrateeAmounts[0];
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getBlockNumberDeviation() external view returns (uint256 blockNumberDeviation_) {
        return blockNumberDeviation;
    }

    function getCentralizedRateProvider()
        external
        view
        returns (address centralizedRateProvider_)
    {
        return MOCK_CENTRALIZED_RATE_PROVIDER;
    }
}
