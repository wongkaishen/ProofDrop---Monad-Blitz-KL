"""End-to-end signer sanity check.

Signs a voucher with the Python signer, then asks eth_account to recover the
address from the same EIP-712 typed data + signature. Mirrors what the
Solidity contract does on-chain.
"""

from eth_account import Account
from eth_account.messages import encode_typed_data

from signer import Voucher, sign_voucher, signer_address


def main() -> None:
    pk = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
    expected = signer_address(pk)

    chain_id = 10143
    contract = "0x0000000000000000000000000000000000000001"

    voucher = Voucher(
        to="0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        quest_id=1,
        token_uri="data:application/json,{}",
        deadline=1_700_000_000,
    )
    sig = sign_voucher(voucher, private_key=pk, chain_id=chain_id, contract_address=contract)
    print("Signature:", sig)
    assert sig.startswith("0x"), "signature must start with 0x"
    assert len(sig) == 132, f"expected 65-byte hex (132 chars), got {len(sig)}"

    encoded = encode_typed_data(
        domain_data={
            "name": "ProofDrop",
            "version": "1",
            "chainId": chain_id,
            "verifyingContract": contract,
        },
        message_types={
            "ClaimVoucher": [
                {"name": "to", "type": "address"},
                {"name": "questId", "type": "uint256"},
                {"name": "tokenURI", "type": "string"},
                {"name": "deadline", "type": "uint256"},
            ],
        },
        message_data={
            "to": voucher.to,
            "questId": voucher.quest_id,
            "tokenURI": voucher.token_uri,
            "deadline": voucher.deadline,
        },
    )
    recovered = Account.recover_message(encoded, signature=sig)
    print("Expected signer :", expected)
    print("Recovered signer:", recovered)
    assert recovered == expected, "signature did not recover to expected address"
    print("OK: signature roundtrips correctly.")


if __name__ == "__main__":
    main()
