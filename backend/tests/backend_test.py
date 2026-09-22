"""FleetCare backend API tests"""
import os
import pytest
import requests
from datetime import datetime, timezone, date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fleet-compliance-25.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "sertrani@gmail.com"
ADMIN_PASSWORD = "fleet2026"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data["user"]["email"] == ADMIN_EMAIL
    return data["token"]


@pytest.fixture(scope="session")
def auth(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# ---------- Auth ----------
class TestAuth:
    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me(self, auth):
        r = auth.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401


# ---------- Vehicles + collaudo math ----------
class TestVehicles:
    created_ids = []

    def test_create_vehicle_collaudo_from_immatricolazione(self, auth):
        payload = {"targa": "TEST_AB123CD", "marca_modello": "Fiat Panda",
                   "data_immatricolazione": "2021-05-15"}
        r = auth.post(f"{API}/vehicles", json=payload)
        assert r.status_code == 200, r.text
        v = r.json()
        assert v["collaudo_deadline"] == "2025-05-31"
        assert v["targa"] == "TEST_AB123CD"
        TestVehicles.created_ids.append(v["id"])
        # persistence check
        g = auth.get(f"{API}/vehicles/{v['id']}")
        assert g.status_code == 200
        assert g.json()["collaudo_deadline"] == "2025-05-31"

    def test_register_collaudo_updates_deadline(self, auth):
        vid = TestVehicles.created_ids[0]
        r = auth.post(f"{API}/vehicles/{vid}/collaudo", json={"data_collaudo": "2025-09-20"})
        assert r.status_code == 200
        assert r.json()["collaudo_deadline"] == "2027-09-30"

    def test_circulation_expired_bollo_but_valid(self, auth):
        # Vehicle with expired bollo, valid collaudo (recent), active future policy => can circulate
        payload = {"targa": "TEST_CIRC01", "marca_modello": "VW Polo",
                   "data_immatricolazione": "2023-01-10",
                   "bollo_scadenza": "2024-01-31",  # expired
                   "last_collaudo_date": "2026-01-15"}  # valid, deadline 2028-01-31
        r = auth.post(f"{API}/vehicles", json=payload)
        assert r.status_code == 200
        v = r.json()
        TestVehicles.created_ids.append(v["id"])
        # attach valid policy
        future = (date.today() + timedelta(days=200)).isoformat()
        p = auth.put(f"{API}/vehicles/{v['id']}/policy", json={
            "compagnia": "TestIns", "tipologia": "annuale",
            "data_stipula": "2026-01-01", "scadenza_contratto": future
        })
        assert p.status_code == 200
        vv = p.json()
        assert vv["bollo_state"] == "expired"
        assert vv["can_circulate"] is True, f"Should circulate despite bollo expired: {vv}"

    def test_circulation_no_policy(self, auth):
        payload = {"targa": "TEST_NOPOL", "marca_modello": "Kia Rio",
                   "data_immatricolazione": "2024-01-01"}
        r = auth.post(f"{API}/vehicles", json=payload)
        vid = r.json()["id"]
        TestVehicles.created_ids.append(vid)
        assert r.json()["can_circulate"] is False

    def test_delete_vehicle(self, auth):
        payload = {"targa": "TEST_DELME", "marca_modello": "X", "data_immatricolazione": "2020-01-01"}
        r = auth.post(f"{API}/vehicles", json=payload)
        vid = r.json()["id"]
        d = auth.delete(f"{API}/vehicles/{vid}")
        assert d.status_code == 200
        g = auth.get(f"{API}/vehicles/{vid}")
        assert g.status_code == 404


# ---------- Insurance suspension ----------
class TestSuspension:
    def test_suspend_and_reactivate_flow(self, auth):
        r = auth.post(f"{API}/vehicles", json={
            "targa": "TEST_SUSP01", "marca_modello": "Ford Focus",
            "data_immatricolazione": "2023-06-01", "last_collaudo_date": "2025-06-15"
        })
        vid = r.json()["id"]
        future = (date.today() + timedelta(days=200)).isoformat()
        auth.put(f"{API}/vehicles/{vid}/policy", json={
            "compagnia": "Ins", "tipologia": "annuale",
            "data_stipula": "2026-01-01", "scadenza_contratto": future
        })
        s = auth.post(f"{API}/vehicles/{vid}/policy/suspend")
        assert s.status_code == 200
        v = s.json()
        assert v["policy"]["status"] == "suspended"
        assert v["can_circulate"] is False

        # can't suspend again
        s2 = auth.post(f"{API}/vehicles/{vid}/policy/suspend")
        assert s2.status_code == 400

        ra = auth.post(f"{API}/vehicles/{vid}/policy/reactivate")
        assert ra.status_code == 200
        assert ra.json()["policy"]["status"] == "active"

        auth.delete(f"{API}/vehicles/{vid}")

    def test_304_day_cap_blocks_suspend(self, auth):
        # Set cumulative days to 304 directly via mongo not available; use behavior:
        # Instead, we simulate by pushing cumulative to threshold using direct mongo access if available
        # Fallback: verify endpoint returns 400 when cumulative >= 304 by manipulating via re-set policy
        # Since API doesn't allow setting cumulative directly, we use mongo
        try:
            import pymongo
            mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
            db_name = os.environ.get("DB_NAME", "test_database")
            mc = pymongo.MongoClient(mongo_url)
            dbh = mc[db_name]
        except Exception as e:
            pytest.skip(f"Cannot access mongo directly: {e}")

        r = auth.post(f"{API}/vehicles", json={
            "targa": "TEST_CAP304", "marca_modello": "Test", "data_immatricolazione": "2023-01-01",
            "last_collaudo_date": "2025-01-15"
        })
        vid = r.json()["id"]
        future = (date.today() + timedelta(days=200)).isoformat()
        auth.put(f"{API}/vehicles/{vid}/policy", json={
            "compagnia": "Ins", "tipologia": "annuale",
            "data_stipula": "2026-01-01", "scadenza_contratto": future
        })
        # set cumulative to 304
        dbh.vehicles.update_one({"id": vid}, {"$set": {
            "policy.cumulative_suspension_days": 304,
            "policy.suspension_limit_reached": True,
            "policy.status": "active",
            "policy.current_suspension_start": None,
        }})
        s = auth.post(f"{API}/vehicles/{vid}/policy/suspend")
        assert s.status_code == 400
        assert "Limite" in s.text or "10 mesi" in s.text

        g = auth.get(f"{API}/vehicles/{vid}").json()
        assert g["policy"]["can_suspend"] is False
        assert g["policy"]["cumulative_suspension_days"] == 304

        auth.delete(f"{API}/vehicles/{vid}")


# ---------- Dashboard + Reports ----------
class TestDashboardReports:
    def test_dashboard_stats(self, auth):
        r = auth.get(f"{API}/dashboard/stats")
        assert r.status_code == 200
        d = r.json()
        for k in ["total", "can_circulate", "cannot_circulate", "suspended", "upcoming_30"]:
            assert k in d
        assert d["total"] == d["can_circulate"] + d["cannot_circulate"]

    def test_report_excel(self, auth):
        r = auth.get(f"{API}/reports/excel")
        assert r.status_code == 200
        assert "spreadsheetml" in r.headers.get("content-type", "")
        assert len(r.content) > 100

    def test_report_pdf(self, auth):
        r = auth.get(f"{API}/reports/pdf")
        assert r.status_code == 200
        assert "application/pdf" in r.headers.get("content-type", "")
        assert r.content[:4] == b"%PDF"


# ---------- Cleanup ----------
@pytest.fixture(scope="session", autouse=True)
def cleanup(auth):
    yield
    try:
        r = auth.get(f"{API}/vehicles")
        for v in r.json():
            if v.get("targa", "").startswith("TEST_"):
                auth.delete(f"{API}/vehicles/{v['id']}")
    except Exception:
        pass
