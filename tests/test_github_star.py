"""One-click GitHub starring stays fixed, local, and explicitly user-driven."""

import subprocess

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.routers import github_star


@pytest.fixture
def client():
    return TestClient(
        app,
        base_url="http://127.0.0.1:8000",
        client=("127.0.0.1", 50000),
    )


def completed(returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess([], returncode, stdout=stdout, stderr=stderr)


class TestGitHubCliState:
    def test_reports_a_starred_repository(self, monkeypatch):
        monkeypatch.setattr(github_star, "_run_gh", lambda *args: completed())
        assert github_star._query_star_state() == {
            "available": True,
            "starred": True,
            "reason": None,
            "repository": "sioaeko/OpenVoiceChanger",
        }

    def test_treats_githubs_404_as_not_starred(self, monkeypatch):
        monkeypatch.setattr(
            github_star,
            "_run_gh",
            lambda *args: completed(1, stderr="gh: Not Found (HTTP 404)"),
        )
        state = github_star._query_star_state()
        assert state["available"] is True
        assert state["starred"] is False

    def test_reports_missing_cli_without_exposing_a_command_error(self, monkeypatch):
        def missing(*args):
            raise github_star.GitHubCliError("gh_not_installed")

        monkeypatch.setattr(github_star, "_run_gh", missing)
        assert github_star._query_star_state()["reason"] == "gh_not_installed"

    def test_put_is_fixed_to_openvoicechanger(self, monkeypatch):
        calls = []

        def capture(*args):
            calls.append(args)
            return completed()

        monkeypatch.setattr(github_star, "_run_gh", capture)
        state = github_star._star_repository()
        assert state["starred"] is True
        assert calls == [(
            "api",
            "--silent",
            "--method",
            "PUT",
            "-H",
            "Accept: application/vnd.github+json",
            "/user/starred/sioaeko/OpenVoiceChanger",
        )]


class TestGitHubStarEndpoint:
    @staticmethod
    def action_headers(origin="http://127.0.0.1:8000"):
        return {
            "Origin": origin,
            "X-OpenVoiceChanger-Action": "star",
        }

    def test_get_is_read_only_and_reports_state(self, client, monkeypatch):
        monkeypatch.setattr(
            github_star,
            "_query_star_state",
            lambda: {"available": True, "starred": False, "reason": None},
        )
        response = client.get("/api/github/star")
        assert response.status_code == 200
        assert response.json()["starred"] is False

    def test_post_requires_a_browser_origin(self, client, monkeypatch):
        monkeypatch.setattr(github_star, "_star_repository", lambda: pytest.fail("must not star"))
        response = client.post(
            "/api/github/star",
            headers={"X-OpenVoiceChanger-Action": "star"},
        )
        assert response.status_code == 403

    def test_post_rejects_a_cross_site_origin(self, client, monkeypatch):
        monkeypatch.setattr(github_star, "_star_repository", lambda: pytest.fail("must not star"))
        response = client.post(
            "/api/github/star",
            headers=self.action_headers("https://evil.example"),
        )
        assert response.status_code == 403

    def test_post_requires_the_explicit_action_header(self, client, monkeypatch):
        monkeypatch.setattr(github_star, "_star_repository", lambda: pytest.fail("must not star"))
        response = client.post(
            "/api/github/star",
            headers={"Origin": "http://127.0.0.1:8000"},
        )
        assert response.status_code == 403

    def test_post_rejects_a_lan_client(self, monkeypatch):
        remote_client = TestClient(
            app,
            base_url="http://127.0.0.1:8000",
            client=("10.0.1.20", 50000),
        )
        monkeypatch.setattr(github_star, "_star_repository", lambda: pytest.fail("must not star"))
        response = remote_client.post(
            "/api/github/star",
            headers=self.action_headers(),
        )
        assert response.status_code == 403

    def test_post_stars_after_an_explicit_local_click(self, client, monkeypatch):
        monkeypatch.setattr(
            github_star,
            "_star_repository",
            lambda: {
                "available": True,
                "starred": True,
                "reason": None,
                "repository": "sioaeko/OpenVoiceChanger",
            },
        )
        response = client.post(
            "/api/github/star",
            headers=self.action_headers(),
        )
        assert response.status_code == 200
        assert response.json()["starred"] is True

    def test_post_returns_a_manual_fallback_when_gh_fails(self, client, monkeypatch):
        monkeypatch.setattr(
            github_star,
            "_star_repository",
            lambda: {
                "available": False,
                "starred": None,
                "reason": "github_auth_required",
                "repository": "sioaeko/OpenVoiceChanger",
            },
        )
        response = client.post(
            "/api/github/star",
            headers=self.action_headers(),
        )
        assert response.status_code == 503
        assert "finish manually" in response.json()["detail"]
