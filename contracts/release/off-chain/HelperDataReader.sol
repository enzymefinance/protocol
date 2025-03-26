// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IERC20} from "../../external-interfaces/IERC20.sol";
import {IExternalPositionFactory} from "../../persistent/external-positions/IExternalPositionFactory.sol";
import {IExternalPositionProxy} from "../../persistent/external-positions/IExternalPositionProxy.sol";
import {IHelperDataReader as IHelperDataReaderPersistent} from
    "../../persistent/off-chain/helper-data-reader/IHelperDataReader.sol";
import {IFundValueCalculator} from "../../persistent/fund-value-calculator/IFundValueCalculator.sol";

import {IComptroller} from "../core/fund/comptroller/IComptroller.sol";
import {IVault} from "../core/fund/vault/IVault.sol";
import {IExternalPosition} from "../extensions/external-position-manager/IExternalPosition.sol";
import {IPolicyManager} from "../extensions/policy-manager/IPolicyManager.sol";
import {IPolicy} from "../extensions/policy-manager/IPolicy.sol";
import {IFeeManager} from "../extensions/fee-manager/IFeeManager.sol";
import {IFee} from "../extensions/fee-manager/IFee.sol";
import {IHelperDataReader} from "./interfaces/IHelperDataReader.sol";

interface IFundValueCalculatorRouter {
    function calcNetShareValue(address _vaultProxy)
        external
        returns (address denominationAsset_, uint256 netShareValue_);

    function calcGav(address _vaultProxy) external returns (address denominationAsset_, uint256 gav_);
}

interface IPolicyManagerExtended is IPolicyManager {
    function getEnabledPoliciesForFund(address _comptrollerProxy)
        external
        view
        returns (address[] memory enabledPolicies_);
}

interface IFeeManagerExtended is IFeeManager {
    function getEnabledFeesForFund(address _comptrollerProxy) external view returns (address[] memory enabledFees_);
}

/// @title HelperDataReader Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice A peripheral contract for serving fund value calculation requests from the FundValueCalculatorRouter
/// @dev These are convenience functions intended for off-chain consumption,
/// some of which involve potentially expensive state transitions.
contract HelperDataReader is IHelperDataReader, IHelperDataReaderPersistent {
    IFundValueCalculatorRouter private immutable FUND_VALUE_CALCULATOR_ROUTER;
    IExternalPositionFactory private immutable EXTERNAL_POSITION_FACTORY;
    IPolicyManagerExtended private immutable POLICY_MANAGER;
    IFeeManagerExtended private immutable FEE_MANAGER;

    constructor(
        IFundValueCalculatorRouter _fundValueCalculatorRouter,
        IExternalPositionFactory _externalPositionFactory,
        IPolicyManagerExtended _policyManager,
        IFeeManagerExtended _feeManager
    ) {
        FUND_VALUE_CALCULATOR_ROUTER = _fundValueCalculatorRouter;
        EXTERNAL_POSITION_FACTORY = _externalPositionFactory;
        POLICY_MANAGER = _policyManager;
        FEE_MANAGER = _feeManager;
    }

    function getVaultDetailsExtendedDecoded(address _vaultProxy) public returns (VaultDetailsExtended memory) {
        VaultDetails memory vaultDetails = getVaultDetailsDecoded(_vaultProxy);

        return VaultDetailsExtended({
            name: vaultDetails.name,
            symbol: vaultDetails.symbol,
            totalSupply: vaultDetails.totalSupply,
            denominationAsset: vaultDetails.denominationAsset,
            netShareValue: vaultDetails.netShareValue,
            grossAssetValue: vaultDetails.grossAssetValue,
            owner: vaultDetails.owner,
            hasInvalidAum: vaultDetails.hasInvalidAum,
            activeExternalPositionsDetails: getVaultActiveExternalPositionsDetailsDecoded(_vaultProxy),
            trackedAssetsAmounts: getVaultTrackedAssetsAmountsDecoded(_vaultProxy),
            policiesDetails: getVaultPoliciesDetailsDecoded(_vaultProxy),
            feesDetails: getVaultFeesDetailsDecoded(_vaultProxy)
        });
    }

    function getVaultDetailsExtended(address _vaultProxy) public override returns (bytes memory) {
        return abi.encode(getVaultDetailsExtendedDecoded(_vaultProxy));
    }

    function getVaultDetailsDecoded(address _vaultProxy) public returns (VaultDetails memory) {
        string memory name = IERC20(_vaultProxy).name();
        string memory symbol = IERC20(_vaultProxy).symbol();
        uint256 totalSupply = IERC20(_vaultProxy).totalSupply();
        address comptrollerProxy = IVault(_vaultProxy).getAccessor();
        address owner = IVault(_vaultProxy).getOwner();
        address denominationAsset = IComptroller(comptrollerProxy).getDenominationAsset();

        try FUND_VALUE_CALCULATOR_ROUTER.calcNetShareValue(_vaultProxy) returns (address, uint256 netShareValue) {
            (, uint256 grossAssetValue) = FUND_VALUE_CALCULATOR_ROUTER.calcGav(_vaultProxy);

            return VaultDetails({
                name: name,
                symbol: symbol,
                totalSupply: totalSupply,
                denominationAsset: denominationAsset,
                netShareValue: netShareValue,
                grossAssetValue: grossAssetValue,
                owner: owner,
                hasInvalidAum: false
            });
        } catch {
            return VaultDetails({
                name: name,
                symbol: symbol,
                totalSupply: totalSupply,
                denominationAsset: denominationAsset,
                netShareValue: 0,
                grossAssetValue: 0,
                owner: owner,
                hasInvalidAum: true
            });
        }
    }

    function getVaultDetails(address _vaultProxy) public override returns (bytes memory) {
        return abi.encode(getVaultDetailsDecoded(_vaultProxy));
    }

    function getVaultTrackedAssetsAmountsDecoded(address _vaultProxy) public view returns (AssetAmount[] memory) {
        address[] memory trackedAssets = IVault(_vaultProxy).getTrackedAssets();

        AssetAmount[] memory trackedAssetsAmounts = new AssetAmount[](trackedAssets.length);

        for (uint256 i = 0; i < trackedAssets.length; i++) {
            trackedAssetsAmounts[i] =
                AssetAmount({asset: trackedAssets[i], amount: IERC20(trackedAssets[i]).balanceOf(_vaultProxy)});
        }

        return trackedAssetsAmounts;
    }

    function getVaultTrackedAssetsAmounts(address _vaultProxy) public view override returns (bytes memory) {
        return abi.encode(getVaultTrackedAssetsAmountsDecoded(_vaultProxy));
    }

    function getVaultActiveExternalPositionsDetailsDecoded(address _vaultProxy)
        public
        returns (ExternalPositionDetails[] memory)
    {
        address[] memory externalPositions = IVault(_vaultProxy).getActiveExternalPositions();

        ExternalPositionDetails[] memory externalPositionsDetails =
            new ExternalPositionDetails[](externalPositions.length);

        for (uint256 i = 0; i < externalPositions.length; i++) {
            address externalPosition = externalPositions[i];
            uint256 typeId = IExternalPositionProxy(externalPosition).getExternalPositionType();

            string memory label = EXTERNAL_POSITION_FACTORY.getLabelForPositionType(typeId);

            (address[] memory debtAssets, uint256[] memory debtAmounts) =
                IExternalPosition(externalPosition).getDebtAssets();

            (address[] memory managedAssets, uint256[] memory managedAmounts) =
                IExternalPosition(externalPosition).getManagedAssets();

            AssetAmount[] memory debtAssetsAmounts = new AssetAmount[](debtAssets.length);
            for (uint256 j = 0; j < debtAssets.length; j++) {
                debtAssetsAmounts[j] = AssetAmount({asset: debtAssets[j], amount: debtAmounts[j]});
            }

            AssetAmount[] memory managedAssetsAmounts = new AssetAmount[](managedAssets.length);
            for (uint256 j = 0; j < managedAssets.length; j++) {
                managedAssetsAmounts[j] = AssetAmount({asset: managedAssets[j], amount: managedAmounts[j]});
            }

            externalPositionsDetails[i] = ExternalPositionDetails({
                label: label,
                id: externalPosition,
                typeId: typeId,
                debtAssetsAmounts: debtAssetsAmounts,
                managedAssetsAmounts: managedAssetsAmounts
            });
        }

        return externalPositionsDetails;
    }

    function getVaultActiveExternalPositionsDetails(address _vaultProxy) public override returns (bytes memory) {
        return abi.encode(getVaultActiveExternalPositionsDetailsDecoded(_vaultProxy));
    }

    function getVaultPoliciesDetailsDecoded(address _vaultProxy) public view returns (PolicyDetails[] memory) {
        address comptrollerProxy = IVault(_vaultProxy).getAccessor();

        address[] memory policies = POLICY_MANAGER.getEnabledPoliciesForFund(comptrollerProxy);

        PolicyDetails[] memory policyDetails = new PolicyDetails[](policies.length);

        for (uint256 i = 0; i < policies.length; i++) {
            address policy = policies[i];

            string memory identifier = IPolicy(policy).identifier();

            policyDetails[i] = PolicyDetails({identifier: identifier, id: policy});
        }

        return policyDetails;
    }

    function getVaultPoliciesDetails(address _vaultProxy) public view override returns (bytes memory) {
        return abi.encode(getVaultPoliciesDetailsDecoded(_vaultProxy));
    }

    function getVaultFeesDetailsDecoded(address _vaultProxy) public view returns (FeeDetails[] memory) {
        address comptrollerProxy = IVault(_vaultProxy).getAccessor();

        address[] memory fees = FEE_MANAGER.getEnabledFeesForFund(comptrollerProxy);

        FeeDetails[] memory feesDetails = new FeeDetails[](fees.length);

        for (uint256 i = 0; i < fees.length; i++) {
            address fee = fees[i];

            address recipientForFund = IFee(fee).getRecipientForFund(comptrollerProxy);

            feesDetails[i] = FeeDetails({id: fee, recipientForFund: recipientForFund});
        }

        return feesDetails;
    }

    function getVaultFeesDetails(address _vaultProxy) public view override returns (bytes memory) {
        return abi.encode(getVaultFeesDetailsDecoded(_vaultProxy));
    }
}
