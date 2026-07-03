from app.services.classifier import classify_ip


def test_known_relay_is_not_actionable() -> None:
    result = classify_ip("157.240.16.35", 443, 42120)

    assert result.classification == "relay"
    assert result.confidence >= 0.8


def test_indian_subscriber_range_is_p2p_candidate() -> None:
    result = classify_ip("49.36.128.45", 45892, 880122)

    assert result.classification == "p2p"
    assert result.operator == "Jio"

