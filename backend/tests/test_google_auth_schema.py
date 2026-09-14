from app.schemas import AuthProvidersOut, GoogleAuthRequest


def test_google_auth_request_requires_token():
    row = GoogleAuthRequest(id_token="x" * 24)
    assert len(row.id_token) >= 20


def test_auth_providers_shape():
    out = AuthProvidersOut(google=True, google_client_id="abc.apps.googleusercontent.com")
    assert out.google is True
    assert out.google_client_id.endswith("googleusercontent.com")
