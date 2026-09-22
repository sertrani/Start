"""Iteration 5 tests: bell_days setting, /audit/operators + user_email filter, vehicle PDF."""
import os
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"email": "sertrani@gmail.com", "password": "fleet2026"}
LIMITED = {"email": "operatore1@test.it", "password": "pass123"}


def _login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def limited_h():
    return {"Authorization": f"Bearer {_login(LIMITED)}"}


# ---------- Bell days ----------
class TestBellDays:
    def test_get_settings_has_bell_days(self, admin_h):
        r = requests.get(f"{BASE}/api/settings", headers=admin_h, timeout=15)
        assert r.status_code == 200
        assert "bell_days" in r.json()

    def test_update_bell_days_persists_and_reflects_in_notifications(self, admin_h):
        # save original
        orig = requests.get(f"{BASE}/api/settings", headers=admin_h).json()
        orig_bell = orig.get("bell_days", 7)
        try:
            payload = {**orig, "bell_days": 45}
            # strip _id/id nulls
            payload.pop("_id", None)
            r = requests.put(f"{BASE}/api/settings", headers=admin_h, json=payload, timeout=15)
            assert r.status_code == 200, r.text
            assert r.json()["bell_days"] == 45

            n45 = requests.get(f"{BASE}/api/notifications/today", headers=admin_h, timeout=15).json()
            assert n45["bell_days"] == 45
            up45 = len(n45["upcoming"])

            payload["bell_days"] = 1
            r = requests.put(f"{BASE}/api/settings", headers=admin_h, json=payload, timeout=15)
            assert r.status_code == 200
            n1 = requests.get(f"{BASE}/api/notifications/today", headers=admin_h, timeout=15).json()
            assert n1["bell_days"] == 1
            up1 = len(n1["upcoming"])

            # larger window should not have fewer upcoming events
            assert up45 >= up1
            # count still equals overdue + today (independent of bell_days)
            assert n45["count"] == len(n45["overdue"]) + len(n45["today"])
            assert n1["count"] == len(n1["overdue"]) + len(n1["today"])
            assert n45["count"] == n1["count"]
        finally:
            payload = {**orig, "bell_days": orig_bell}
            payload.pop("_id", None)
            requests.put(f"{BASE}/api/settings", headers=admin_h, json=payload, timeout=15)


# ---------- Audit operators / user_email filter ----------
class TestAuditOperators:
    def test_operators_list(self, admin_h):
        r = requests.get(f"{BASE}/api/audit/operators", headers=admin_h, timeout=15)
        assert r.status_code == 200
        ops = r.json()
        assert isinstance(ops, list)
        assert any(o.get("email") == "sertrani@gmail.com" for o in ops)
        for o in ops:
            assert "email" in o and "name" in o

    def test_user_email_filter_narrows(self, admin_h):
        all_r = requests.get(f"{BASE}/api/audit", headers=admin_h, timeout=15).json()
        assert isinstance(all_r, list) and len(all_r) > 0
        filt = requests.get(
            f"{BASE}/api/audit", headers=admin_h,
            params={"user_email": "sertrani@gmail.com"}, timeout=15
        ).json()
        assert len(filt) <= len(all_r)
        assert all(e.get("user_email") == "sertrani@gmail.com" for e in filt)

    def test_user_email_no_match(self, admin_h):
        r = requests.get(
            f"{BASE}/api/audit", headers=admin_h,
            params={"user_email": "nobody_xxx@example.com"}, timeout=15
        )
        assert r.status_code == 200
        assert r.json() == []

    def test_export_respects_user_email(self, admin_h):
        r = requests.get(
            f"{BASE}/api/reports/audit/excel", headers=admin_h,
            params={"user_email": "sertrani@gmail.com"}, timeout=30
        )
        assert r.status_code == 200
        assert "openxmlformats" in r.headers.get("content-type", "")


# ---------- Vehicle PDF ----------
class TestVehiclePDF:
    def _first_vid(self, headers):
        vs = requests.get(f"{BASE}/api/vehicles", headers=headers, timeout=15).json()
        assert vs, "no vehicles seeded"
        return vs[0]["id"]

    def test_pdf_admin_200(self, admin_h):
        vid = self._first_vid(admin_h)
        r = requests.get(f"{BASE}/api/reports/vehicle/{vid}/pdf", headers=admin_h, timeout=60)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_pdf_limited_403(self, admin_h, limited_h):
        vid = self._first_vid(admin_h)
        r = requests.get(f"{BASE}/api/reports/vehicle/{vid}/pdf", headers=limited_h, timeout=30)
        assert r.status_code == 403

    def test_pdf_unknown_vehicle_404(self, admin_h):
        r = requests.get(f"{BASE}/api/reports/vehicle/does-not-exist/pdf", headers=admin_h, timeout=30)
        assert r.status_code == 404


# ---------- Regression sanity ----------
class TestRegression:
    def test_auth_me(self, admin_h):
        assert requests.get(f"{BASE}/api/auth/me", headers=admin_h, timeout=10).status_code == 200

    def test_vehicles_list(self, admin_h):
        assert requests.get(f"{BASE}/api/vehicles", headers=admin_h, timeout=15).status_code == 200

    def test_audit_with_action_filter(self, admin_h):
        r = requests.get(f"{BASE}/api/audit", headers=admin_h, params={"action": "policy_renew"}, timeout=15)
        assert r.status_code == 200
        assert all(e.get("action") == "policy_renew" for e in r.json())

    def test_fleet_reports_still_work(self, admin_h):
        assert requests.get(f"{BASE}/api/reports/excel", headers=admin_h, timeout=30).status_code == 200
        assert requests.get(f"{BASE}/api/reports/pdf", headers=admin_h, timeout=30).status_code == 200

    def test_login_log(self, admin_h):
        assert requests.get(f"{BASE}/api/login-log", headers=admin_h, timeout=15).status_code == 200
