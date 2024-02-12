// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IAddressListRegistry as IAddressListRegistryProd} from
    "contracts/persistent/address-list-registry/IAddressListRegistry.sol";
import {IUintListRegistry as IUintListRegistryProd} from "contracts/persistent/uint-list-registry/IUintListRegistry.sol";
import {IVault as IVaultProd} from "contracts/release/core/fund/vault/IVault.sol";
import {IFeeManager as IFeeManagerProd} from "contracts/release/extensions/fee-manager/IFeeManager.sol";
import {IChainlinkPriceFeedMixin as IChainlinkPriceFeedMixinProd} from
    "contracts/release/infrastructure/price-feeds/primitives/IChainlinkPriceFeedMixin.sol";

import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IFeeManager} from "tests/interfaces/internal/IFeeManager.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IUintListRegistry} from "tests/interfaces/internal/IUintListRegistry.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";
import {CommonUtilsBase} from "tests/utils/bases/CommonUtilsBase.sol";

abstract contract TypeUtils is CommonUtilsBase {
    // TYPE FORMATTERS: production enums

    function formatAddressListRegistryUpdateType(IAddressListRegistryProd.UpdateType _updateType)
        internal
        pure
        returns (IAddressListRegistry.UpdateType formattedUpdateType_)
    {
        return IAddressListRegistry.UpdateType.wrap(uint8(_updateType));
    }

    function formatChainlinkRateAsset(IChainlinkPriceFeedMixinProd.RateAsset _rateAsset)
        internal
        pure
        returns (IValueInterpreter.RateAsset formattedRateAsset_)
    {
        return IValueInterpreter.RateAsset.wrap(uint8(_rateAsset));
    }

    function formatFeeHook(IFeeManagerProd.FeeHook _feeHook)
        internal
        pure
        returns (IFeeManager.FeeHook formattedFeeHook_)
    {
        return IFeeManager.FeeHook.wrap(uint8(_feeHook));
    }

    function formatUintListRegistryUpdateType(IUintListRegistryProd.UpdateType _updateType)
        internal
        pure
        returns (IUintListRegistry.UpdateType formattedUpdateType_)
    {
        return IUintListRegistry.UpdateType.wrap(uint8(_updateType));
    }

    function formatVaultActionForComptroller(IVaultProd.VaultAction _vaultAction)
        internal
        pure
        returns (IComptrollerLib.VaultAction formattedVaultAction_)
    {
        return IComptrollerLib.VaultAction.wrap(uint8(_vaultAction));
    }

    // TYPE FORMATTERS: test interface structs

    function formatComptrollerConfigInputForFundDeployer(IComptrollerLib.ConfigInput memory _config)
        internal
        pure
        returns (IFundDeployer.ConfigInput memory formattedConfig_)
    {
        IFundDeployer.ExtensionConfigInput[] memory extensionsConfig =
            new IFundDeployer.ExtensionConfigInput[](_config.extensionsConfig.length);
        for (uint256 i; i < _config.extensionsConfig.length; i++) {
            extensionsConfig[i] = IFundDeployer.ExtensionConfigInput({
                extension: _config.extensionsConfig[i].extension,
                configData: _config.extensionsConfig[i].configData
            });
        }

        return IFundDeployer.ConfigInput({
            denominationAsset: _config.denominationAsset,
            sharesActionTimelock: _config.sharesActionTimelock,
            feeManagerConfigData: _config.feeManagerConfigData,
            policyManagerConfigData: _config.policyManagerConfigData,
            extensionsConfig: extensionsConfig
        });
    }

    // toArray() - bool

    function toArray(bool _0) internal pure returns (bool[] memory array_) {
        array_ = new bool[](1);
        array_[0] = _0;

        return array_;
    }

    function toArray(bool _0, bool _1) internal pure returns (bool[] memory array_) {
        array_ = new bool[](2);
        array_[0] = _0;
        array_[1] = _1;

        return array_;
    }

    function toArray(bool _0, bool _1, bool _2) internal pure returns (bool[] memory array_) {
        array_ = new bool[](3);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;

        return array_;
    }

    function toArray(bool _0, bool _1, bool _2, bool _3) internal pure returns (bool[] memory array_) {
        array_ = new bool[](4);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;
        array_[3] = _3;

        return array_;
    }

    function toArray(bool _0, bool _1, bool _2, bool _3, bool _4) internal pure returns (bool[] memory array_) {
        array_ = new bool[](5);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;
        array_[3] = _3;
        array_[4] = _4;

        return array_;
    }

    // toArray() - address

    function toArray(address _0) internal pure returns (address[] memory array_) {
        array_ = new address[](1);
        array_[0] = _0;

        return array_;
    }

    function toArray(address _0, address _1) internal pure returns (address[] memory array_) {
        array_ = new address[](2);
        array_[0] = _0;
        array_[1] = _1;

        return array_;
    }

    function toArray(address _0, address _1, address _2) internal pure returns (address[] memory array_) {
        array_ = new address[](3);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;

        return array_;
    }

    function toArray(address _0, address _1, address _2, address _3) internal pure returns (address[] memory array_) {
        array_ = new address[](4);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;
        array_[3] = _3;

        return array_;
    }

    function toArray(address _0, address _1, address _2, address _3, address _4)
        internal
        pure
        returns (address[] memory array_)
    {
        array_ = new address[](5);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;
        array_[3] = _3;
        array_[4] = _4;

        return array_;
    }

    // toArray() - uint256

    function toArray(uint256 _0) internal pure returns (uint256[] memory array_) {
        array_ = new uint256[](1);
        array_[0] = _0;

        return array_;
    }

    function toArray(uint256 _0, uint256 _1) internal pure returns (uint256[] memory array_) {
        array_ = new uint256[](2);
        array_[0] = _0;
        array_[1] = _1;

        return array_;
    }

    function toArray(uint256 _0, uint256 _1, uint256 _2) internal pure returns (uint256[] memory array_) {
        array_ = new uint256[](3);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;

        return array_;
    }

    function toArray(uint256 _0, uint256 _1, uint256 _2, uint256 _3) internal pure returns (uint256[] memory array_) {
        array_ = new uint256[](4);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;
        array_[3] = _3;

        return array_;
    }

    // toArray() - bytes32

    function toArray(bytes32 _0) internal pure returns (bytes32[] memory array_) {
        array_ = new bytes32[](1);
        array_[0] = _0;

        return array_;
    }

    function toArray(bytes32 _0, bytes32 _1) internal pure returns (bytes32[] memory array_) {
        array_ = new bytes32[](2);
        array_[0] = _0;
        array_[1] = _1;

        return array_;
    }

    function toArray(bytes32 _0, bytes32 _1, bytes32 _2) internal pure returns (bytes32[] memory array_) {
        array_ = new bytes32[](3);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;

        return array_;
    }

    function toArray(bytes32 _0, bytes32 _1, bytes32 _2, bytes32 _3) internal pure returns (bytes32[] memory array_) {
        array_ = new bytes32[](4);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;
        array_[3] = _3;

        return array_;
    }

    // toArray() - bytes

    function toArray(bytes memory _0) internal pure returns (bytes[] memory array_) {
        array_ = new bytes[](1);
        array_[0] = _0;

        return array_;
    }

    function toArray(bytes memory _0, bytes memory _1) internal pure returns (bytes[] memory array_) {
        array_ = new bytes[](2);
        array_[0] = _0;
        array_[1] = _1;

        return array_;
    }

    function toArray(bytes memory _0, bytes memory _1, bytes memory _2) internal pure returns (bytes[] memory array_) {
        array_ = new bytes[](3);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;

        return array_;
    }

    function toArray(bytes memory _0, bytes memory _1, bytes memory _2, bytes memory _3)
        internal
        pure
        returns (bytes[] memory array_)
    {
        array_ = new bytes[](4);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;
        array_[3] = _3;

        return array_;
    }

    // toArray() - string

    function toArray(string memory _0) internal pure returns (string[] memory array_) {
        array_ = new string[](1);
        array_[0] = _0;

        return array_;
    }

    function toArray(string memory _0, string memory _1) internal pure returns (string[] memory array_) {
        array_ = new string[](2);
        array_[0] = _0;
        array_[1] = _1;

        return array_;
    }

    function toArray(string memory _0, string memory _1, string memory _2)
        internal
        pure
        returns (string[] memory array_)
    {
        array_ = new string[](3);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;

        return array_;
    }

    function toArray(string memory _0, string memory _1, string memory _2, string memory _3)
        internal
        pure
        returns (string[] memory array_)
    {
        array_ = new string[](4);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;
        array_[3] = _3;

        return array_;
    }
}
