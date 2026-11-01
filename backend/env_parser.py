
import re


MAX_FILE_SIZE = 100_000
MAX_VARIABLES = 500
MAX_VALUE_LENGTH = 10_000

KEY_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def parse_env_file(content: str) -> dict:
    """
    Parse .env text without logging or exposing variable values.

    Returns variable keys and values, plus validation errors.
    Values are held in memory only; this function does not persist them.
    """
    if not isinstance(content, str):
        return {
            "variables": [],
            "errors": ["Input must be text."],
        }

    if len(content.encode("utf-8")) > MAX_FILE_SIZE:
        return {
            "variables": [],
            "errors": ["The .env content exceeds the 100 KB limit."],
        }

    variables = []
    errors = []
    seen_keys = set()

    for line_number, raw_line in enumerate(content.splitlines(), start=1):
        line = raw_line.strip()

        if not line or line.startswith("#"):
            continue

        if line.startswith("export "):
            line = line[len("export "):].lstrip()

        if "=" not in line:
            errors.append(
                f"Line {line_number}: expected KEY=VALUE format."
            )
            continue

        key, value = line.split("=", maxsplit=1)
        key = key.strip()

        if not KEY_PATTERN.fullmatch(key):
            errors.append(
                f"Line {line_number}: invalid variable key."
            )
            continue

        if key in seen_keys:
            errors.append(
                f"Line {line_number}: duplicate variable key '{key}'."
            )
            continue

        if len(value) > MAX_VALUE_LENGTH:
            errors.append(
                f"Line {line_number}: value exceeds the 10,000-character limit."
            )
            continue

        if len(variables) >= MAX_VARIABLES:
            errors.append(
                "The .env content exceeds the 500-variable limit."
            )
            break

        # Remove matching outer quotes only.
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]

        variables.append({
            "key": key,
            "value": value,
        })
        seen_keys.add(key)

    return {
        "variables": variables,
        "errors": errors,
    }

SENSITIVE_KEY_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"(^|_)(API_KEY|API_TOKEN|API_SECRET|SECRET_KEY|CLIENT_SECRET)($|_)",
        r"(^|_)(AUTH_TOKEN|ACCESS_TOKEN|REFRESH_TOKEN|OAUTH_TOKEN)($|_)",
        r"(^|_)(PASSWORD|PASSWD|DB_PASSWORD)($|_)",
        r"(^|_)(DATABASE_URL|DATABASE_URI|DB_URI)($|_)",
        r"(^|_)(ENCRYPTION_KEY|PRIVATE_KEY|SSH_PRIVATE_KEY)($|_)",
        r"(^|_)(AWS_SECRET_ACCESS_KEY|GCP_PRIVATE_KEY)($|_)",
        r"(^|_)(STRIPE_SECRET_KEY|PAYMENT_SECRET)($|_)",
    ]
]

SENSITIVE_VALUE_PATTERNS = [
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----", re.IGNORECASE),
    re.compile(r"://[^/\s:@]+:[^@\s]+@"),
    re.compile(r"\beyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"),
]


def is_sensitive_variable(key: str, value: str = "") -> bool:
    """Detect sensitive variables by key name or recognizable secret format."""
    normalized_key = key.strip()

    if any(pattern.search(normalized_key) for pattern in SENSITIVE_KEY_PATTERNS):
        return True

    return any(pattern.search(value or "") for pattern in SENSITIVE_VALUE_PATTERNS)


def mask_env_content(content: str, replacement: str = "********") -> str:
    """Mask sensitive values for normal viewing without changing stored content."""
    masked_lines = []

    for raw_line in content.splitlines(keepends=True):
        line = raw_line.rstrip("\r\n")
        line_ending = raw_line[len(line):]

        stripped = line.lstrip()

        if not stripped or stripped.startswith("#"):
            masked_lines.append(raw_line)
            continue

        prefix = line[:len(line) - len(stripped)]
        candidate = stripped

        if candidate.startswith("export "):
            prefix += "export "
            candidate = candidate[len("export "):]

        if "=" not in candidate:
            masked_lines.append(raw_line)
            continue

        key, value = candidate.split("=", maxsplit=1)

        if not is_sensitive_variable(key, value):
            masked_lines.append(raw_line)
            continue

        quote = value[0] if value and value[0] in ("'", '"') else ""
        closing_quote = quote if quote and value.endswith(quote) else ""

        masked_lines.append(
            prefix + key + "=" + quote + replacement + closing_quote + line_ending
        )

    return "".join(masked_lines)
