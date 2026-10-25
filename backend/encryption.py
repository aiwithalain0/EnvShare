
import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv


# Load configuration from the .env file beside this module.
ENV_FILE = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_FILE)

ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")

if not ENCRYPTION_KEY:
    raise RuntimeError(
        "ENCRYPTION_KEY is missing. Configure it in the backend .env file."
    )

try:
    _fernet = Fernet(ENCRYPTION_KEY.encode("utf-8"))
except (ValueError, TypeError) as exc:
    raise RuntimeError(
        "ENCRYPTION_KEY is invalid. Generate a valid Fernet key."
    ) from exc


def encrypt_value(value: str) -> str:
    """Encrypt a variable value before storing it in the database."""
    return _fernet.encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a stored variable value."""
    try:
        return _fernet.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError, TypeError) as exc:
        raise ValueError(
            "Could not decrypt the stored value."
        ) from exc
