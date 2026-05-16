// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title ProofDropBadge
/// @notice ERC-721 badge minted only when the trusted backend signs an
///         EIP-712 voucher proving the user completed a quest.
contract ProofDropBadge is ERC721Enumerable, ERC721URIStorage, EIP712, Ownable {
    using ECDSA for bytes32;

    /// @dev Address whose signature authorises a claim. Set by owner.
    address public verifier;

    /// @dev Auto-incrementing token id.
    uint256 public nextTokenId;

    /// @dev questId => user => already claimed?
    mapping(uint256 => mapping(address => bool)) public claimed;

    /// @dev tokenId => questId, useful for off-chain indexing.
    mapping(uint256 => uint256) public tokenQuest;

    bytes32 private constant _VOUCHER_TYPEHASH = keccak256(
        "ClaimVoucher(address to,uint256 questId,string tokenURI,uint256 deadline)"
    );

    event VerifierUpdated(address indexed verifier);
    event BadgeClaimed(address indexed to, uint256 indexed questId, uint256 indexed tokenId);

    constructor(address initialVerifier)
        ERC721("ProofDrop Badge", "PDROP")
        EIP712("ProofDrop", "1")
        Ownable(msg.sender)
    {
        require(initialVerifier != address(0), "verifier=0");
        verifier = initialVerifier;
        emit VerifierUpdated(initialVerifier);
    }

    function setVerifier(address newVerifier) external onlyOwner {
        require(newVerifier != address(0), "verifier=0");
        verifier = newVerifier;
        emit VerifierUpdated(newVerifier);
    }

    /// @notice Mint a badge for `to` once the backend voucher is presented.
    /// @param to Recipient (usually msg.sender, but anyone may submit a valid voucher).
    /// @param questId Quest the badge attests to.
    /// @param uri Metadata URI for the badge.
    /// @param deadline Unix timestamp after which the voucher is invalid.
    /// @param signature EIP-712 signature from `verifier` over the voucher fields.
    function claimBadge(
        address to,
        uint256 questId,
        string calldata uri,
        uint256 deadline,
        bytes calldata signature
    ) external returns (uint256 tokenId) {
        require(block.timestamp <= deadline, "voucher expired");
        require(!claimed[questId][to], "already claimed");

        bytes32 structHash = keccak256(
            abi.encode(
                _VOUCHER_TYPEHASH,
                to,
                questId,
                keccak256(bytes(uri)),
                deadline
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = digest.recover(signature);
        require(recovered == verifier, "bad signature");

        claimed[questId][to] = true;
        tokenId = ++nextTokenId;
        tokenQuest[tokenId] = questId;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        emit BadgeClaimed(to, questId, tokenId);
    }

    /// @notice Expose the EIP-712 domain separator for off-chain signers.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // --- Required overrides for ERC721Enumerable + ERC721URIStorage ---

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
