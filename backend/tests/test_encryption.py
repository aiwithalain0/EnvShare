
from encryption import decrypt_value, encrypt_value


def test_encryption_does_not_store_plaintext():
    secret = "fake-test-secret-123"

    ciphertext = encrypt_value(secret)

    assert ciphertext != secret
    assert secret not in ciphertext


def test_decryption_restores_original_value():
    secret = "fake-test-secret-123"

    ciphertext = encrypt_value(secret)

    assert decrypt_value(ciphertext) == secret


def test_empty_value_can_be_encrypted_and_decrypted():
    secret = ""

    ciphertext = encrypt_value(secret)

    assert decrypt_value(ciphertext) == secret
