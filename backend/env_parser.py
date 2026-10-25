
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
