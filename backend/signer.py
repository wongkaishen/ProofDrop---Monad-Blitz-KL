"""EIP-712 voucher signer.

Produces a signature the on-chain ProofDropBadge contract recognises as
authorising a single badge claim.
"""

from __future__ import annotations

from dataclasses import dataclass

from eth_account import Account
from eth_account.messages import encode_typed_data


@dataclass
class Voucher:
    to: str
    quest_id: int
    token_uri: str
    deadline: int


def _domain(chain_id: int, contract_address: str) -> dict:
    return {
        "name": "ProofDrop",
        "version": "1",
        "chainId": chain_id,
        "verifyingContract": contract_address,
    }


_TYPES = {
    "ClaimVoucher": [
        {"name": "to", "type": "address"},
        {"name": "questId", "type": "uint256"},
        {"name": "tokenURI", "type": "string"},
        {"name": "deadline", "type": "uint256"},
    ],
}


def sign_voucher(
    voucher: Voucher,
    *,
    private_key: str,
    chain_id: int,
    contract_address: str,
) -> str:
    """Return a 0x-prefixed hex signature over the voucher."""
    message = {
        "to": voucher.to,
        "questId": voucher.quest_id,
        "tokenURI": voucher.token_uri,
        "deadline": voucher.deadline,
    }
    encoded = encode_typed_data(
        domain_data=_domain(chain_id, contract_address),
        message_types=_TYPES,
        message_data=message,
    )
    signed = Account.sign_message(encoded, private_key=private_key)
    return signed.signature.hex() if signed.signature.hex().startswith("0x") else "0x" + signed.signature.hex()


def signer_address(private_key: str) -> str:
    return Account.from_key(private_key).address
