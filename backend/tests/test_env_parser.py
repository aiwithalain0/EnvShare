
from env_parser import parse_env_file


def test_parses_valid_variables():
    result = parse_env_file(
        "APP_NAME=EnvShare\nAPI_TOKEN=fake-token-123"
    )

    assert result["errors"] == []
    assert len(result["variables"]) == 2
    assert result["variables"][0] == {
        "key": "APP_NAME",
        "value": "EnvShare",
    }


def test_preserves_equals_inside_value():
    result = parse_env_file("DATABASE_URL=host=db;password=a=b=c")

    assert result["errors"] == []
    assert result["variables"][0]["value"] == "host=db;password=a=b=c"


def test_detects_duplicate_keys():
    result = parse_env_file("APP_NAME=First\nAPP_NAME=Second")

    assert any("duplicate" in error.lower() for error in result["errors"])


def test_detects_malformed_lines():
    result = parse_env_file("THIS_LINE_HAS_NO_EQUALS")

    assert any("expected KEY=VALUE" in error for error in result["errors"])


def test_ignores_comments_and_blank_lines():
    result = parse_env_file("# comment\n\nAPP_NAME=EnvShare\n")

    assert result["errors"] == []
    assert len(result["variables"]) == 1


from env_parser import is_sensitive_variable, mask_env_content


def test_detects_sensitive_keys_case_insensitively():
    assert is_sensitive_variable("API_KEY")
    assert is_sensitive_variable("api_key")
    assert is_sensitive_variable("Db_Password")
    assert is_sensitive_variable("API_TOKEN")


def test_detects_sensitive_value_patterns():
    assert is_sensitive_variable(
        "CONFIG",
        "-----BEGIN PRIVATE KEY-----"
    )
    assert is_sensitive_variable(
        "CONFIG",
        "postgres://admin:secret@localhost:5432/app"
    )


def test_masks_sensitive_values_and_preserves_normal_values():
    content = (
        "APP_NAME=EnvShare\n"
        "API_KEY=real-secret\n"
        "DEBUG=true\n"
    )

    masked = mask_env_content(content)

    assert "APP_NAME=EnvShare" in masked
    assert "API_KEY=********" in masked
    assert "real-secret" not in masked
    assert "DEBUG=true" in masked


def test_masks_exported_and_quoted_sensitive_values():
    content = 'export API_KEY="real-secret"\nPASSWORD=\'hidden\'\n'

    masked = mask_env_content(content)

    assert 'export API_KEY="********"' in masked
    assert "PASSWORD='********'" in masked
    assert "real-secret" not in masked
    assert "hidden" not in masked


def test_masking_preserves_comments_and_line_endings():
    content = "# API_KEY=example\r\nAPP_NAME=EnvShare\r\n"

    assert mask_env_content(content) == content
