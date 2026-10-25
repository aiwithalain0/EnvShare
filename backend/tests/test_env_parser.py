
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
