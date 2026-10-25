
from security import hash_password, verify_password


def test_password_is_not_stored_as_plaintext():
    password = "FakeTestPassword123"

    hashed = hash_password(password)

    assert hashed != password
    assert password not in hashed


def test_correct_password_verifies():
    password = "FakeTestPassword123"

    hashed = hash_password(password)

    assert verify_password(password, hashed) is True


def test_incorrect_password_is_rejected():
    hashed = hash_password("FakeTestPassword123")

    assert verify_password("WrongTestPassword456", hashed) is False
