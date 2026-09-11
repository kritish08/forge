"""Guards the SSRF fix on the Web Push endpoint.

A security review confirmed that /notifications/subscribe stored an arbitrary
endpoint URL and the server then POSTed to it, reflecting the target's response
body back to the caller — authenticated SSRF with exfiltration. These cover the
host/scheme gate that closes it. They use literal IPs so no network DNS is
needed; getaddrinfo resolves a literal without a lookup.
"""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "forge_unit_test")
os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret")

from notifications import push_endpoint_is_safe


def test_rejects_loopback():
    # The shape of the original exploit.
    assert push_endpoint_is_safe("https://127.0.0.1/x") is False


def test_rejects_link_local_metadata_endpoint():
    # 169.254.169.254 is the cloud instance-metadata address.
    assert push_endpoint_is_safe("https://169.254.169.254/latest/meta-data/") is False


def test_rejects_rfc1918_private():
    assert push_endpoint_is_safe("https://10.0.0.5/x") is False
    assert push_endpoint_is_safe("https://192.168.1.1/x") is False


def test_rejects_non_https_scheme():
    # http:// to a public host is still refused — the scheme gate alone stops
    # plain-text and non-http schemes.
    assert push_endpoint_is_safe("http://93.184.216.34/x") is False


def test_rejects_non_url_input():
    for bad in (None, "", "not a url", 123, {"endpoint": "x"}):
        assert push_endpoint_is_safe(bad) is False


def test_allows_public_https_host():
    # A public literal IP over https is the legitimate case.
    assert push_endpoint_is_safe("https://93.184.216.34/wpush/abc") is True
