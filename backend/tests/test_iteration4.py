"""FleetCare iteration 4 tests: notifications/today, login-log, audit filters,
audit Excel/PDF exports, and RBAC for these endpoints."""
import os
import uuid
import pytest
import requests
from datetime import date, timedelta

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].splitlines()[0].strip()
            ).rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "sertrani@gmail.com"
ADMIN_PASSWORD = "fleet2026"


def _login(email, pwd):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s, r.json()


@pytest.fixture(scope="module")
def admin():
    s, _ = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    return s


@pytest.fixture(scope="module")
def limited(admin):
    """Create a user with only manage_payments for 403 checks."""
    email = f"test_it4_lim_{uuid.uuid4().hex[:6]}@test.it"
    r = admin.post(f"{API}/users", json={
        "email": email, "password": "pass1234", "name": "It4 Limited",
        "permissions": ["manage_payments"],
    })
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    s, _ = _login(email, "pass1234")
    yield s, email
    admin.delete(f"{API}/users/{uid}")


# ---------------- Notifications /today ----------------
class TestNotificationsToday:
    def test_shape_and_count(self, admin):
        r = admin.get(f"{API}/notifications/today")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("overdue", "today", "upcoming", "count"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["overdue"], list)
        assert isinstance(d["upcoming"], list)
        # count == overdue + today
        assert d["count"] == len(d["overdue"]) + len(d["today"])

    def test_event_fields(self, admin):
        d = admin.get(f"{API}/notifications/today").json()
        all_ev = d["overdue"] + d["today"] + d["upcoming"]
        if not all_ev:
            pytest.skip("No events to inspect")
        e = all_ev[0]
        for k in ("vehicle_id", "targa", "type", "label", "date", "days_left"):
            assert k in e, f"missing field {k} in event: {e}"

    def test_requires_auth(self):
        r = requests.get(f"{API}/notifications/today")
        assert r.status_code in (401, 403)


# ---------------- Login log ----------------
class TestLoginLog:
    def test_admin_can_list(self, admin):
        r = admin.get(f"{API}/login-log", params={"limit": 50})
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        if data:
            e = data[0]
            for k in ("id", "email", "ts"):
                assert k in e
            # no ObjectId leakage
            assert "_id" not in e

    def test_fresh_login_creates_entry(self, admin):
        before = admin.get(f"{API}/login-log", params={"limit": 5}).json()
        # perform a fresh admin login
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                          timeout=15)
        assert r.status_code == 200
        after = admin.get(f"{API}/login-log", params={"limit": 5}).json()
        assert len(after) >= 1
        # newest entry should be admin and very recent
        assert after[0]["email"] == ADMIN_EMAIL
        # id must differ from previous top (new row)
        if before:
            assert after[0]["id"] != before[0]["id"]

    def test_limited_user_gets_403(self, limited):
        sess, _ = limited
        r = sess.get(f"{API}/login-log")
        assert r.status_code == 403, r.text


# ---------------- Audit filters ----------------
class TestAuditFilters:
    def test_action_filter(self, admin):
        r = admin.get(f"{API}/audit", params={"action": "policy_renew", "limit": 100})
        assert r.status_code == 200
        entries = r.json()
        for e in entries:
            assert e["action"] == "policy_renew"

    def test_date_from_future_yields_zero(self, admin):
        future = (date.today() + timedelta(days=365)).isoformat()
        r = admin.get(f"{API}/audit", params={"date_from": future, "limit": 100})
        assert r.status_code == 200
        assert r.json() == []

    def test_vehicle_filter(self, admin):
        # pick any vehicle that has audit entries
        vs = admin.get(f"{API}/vehicles").json()
        if not vs:
            pytest.skip("no vehicles")
        vid = vs[0]["id"]
        r = admin.get(f"{API}/audit", params={"vehicle_id": vid, "limit": 100})
        assert r.status_code == 200
        for e in r.json():
            assert e["vehicle_id"] == vid

    def test_combined_filters_narrower(self, admin):
        all_entries = admin.get(f"{API}/audit", params={"limit": 500}).json()
        filtered = admin.get(f"{API}/audit",
                             params={"action": "policy_renew", "limit": 500}).json()
        assert len(filtered) <= len(all_entries)


# ---------------- Audit exports ----------------
class TestAuditReports:
    def test_excel_200(self, admin):
        r = admin.get(f"{API}/reports/audit/excel")
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "")
        assert "spreadsheet" in ct or "excel" in ct or "openxmlformats" in ct
        assert len(r.content) > 100

    def test_pdf_200(self, admin):
        r = admin.get(f"{API}/reports/audit/pdf")
        assert r.status_code == 200, r.text
        assert "pdf" in r.headers.get("content-type", "").lower()
        assert r.content[:4] == b"%PDF"

    def test_excel_with_filters(self, admin):
        r = admin.get(f"{API}/reports/audit/excel",
                      params={"action": "policy_renew"})
        assert r.status_code == 200
        assert len(r.content) > 100

    def test_excel_403_without_permission(self, limited):
        sess, _ = limited
        r = sess.get(f"{API}/reports/audit/excel")
        assert r.status_code == 403

    def test_pdf_403_without_permission(self, limited):
        sess, _ = limited
        r = sess.get(f"{API}/reports/audit/pdf")
        assert r.status_code == 403


# ---------------- Regression sanity ----------------
class TestRegression:
    def test_me(self, admin):
        r = admin.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_vehicles_list(self, admin):
        r = admin.get(f"{API}/vehicles")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_fleet_reports_still_200(self, admin):
        r1 = admin.get(f"{API}/reports/excel")
        r2 = admin.get(f"{API}/reports/pdf")
        assert r1.status_code == 200
        assert r2.status_code == 200

    def test_calendar(self, admin):
        r = admin.get(f"{API}/calendar")
        assert r.status_code in (200, 404)  # tolerate if not present
