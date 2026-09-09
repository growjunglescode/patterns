from app.services.identity import name_key


def test_name_key_is_case_and_space_insensitive():
    assert name_key("  Maya  ") == name_key("maya")
    assert name_key("Río Negro") == name_key("RÍO NEGRO")
