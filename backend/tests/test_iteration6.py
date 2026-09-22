"""Iteration 6 tests: Vehicle note field, notification bell overdue/today/upcoming split."""
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


# ---------- Notifications overdue/today/upcoming ----------
class TestNotificationsSplit:
    def test_shape(self, admin_h):
        r = requests.get(f"{BASE}/api/notifications/today", headers=admin_h, timeout=15)
        assert r.status_code == 200
        data = r.json()
        for k in ("overdue", "today", "upcoming", "bell_days", "count"):
            assert k in data, f"missing key {k}"
        assert isinstance(data["overdue"], list)
        assert isinstance(data["today"], list)
        assert isinstance(data["upcoming"], list)
        # Count is overdue+today (red count semantics)
        assert data["count"] == len(data["overdue"]) + len(data["today"])

    def test_bell_days_window_affects_upcoming_only(self, admin_h):
        orig = requests.get(f"{BASE}/api/settings", headers=admin_h).json()
        orig_bell = orig.get("bell_days", 7)
        try:
            payload = {**orig, "bell_days": 60}
            payload.pop("_id", None)
            assert requests.put(f"{BASE}/api/settings", headers=admin_h, json=payload).status_code == 200
            big = requests.get(f"{BASE}/api/notifications/today", headers=admin_h).json()

            payload["bell_days"] = 1
            assert requests.put(f"{BASE}/api/settings", headers=admin_h, json=payload).status_code == 200
            small = requests.get(f"{BASE}/api/notifications/today", headers=admin_h).json()

            assert big["bell_days"] == 60 and small["bell_days"] == 1
            assert len(big["upcoming"]) >= len(small["upcoming"])
            # overdue/today should not depend on window
            assert len(big["overdue"]) == len(small["overdue"])
            assert len(big["today"]) == len(small["today"])
            assert big["count"] == small["count"]
        finally:
            payload = {**orig, "bell_days": orig_bell}
            payload.pop("_id", None)
            requests.put(f"{BASE}/api/settings", headers=admin_h, json=payload)


# ---------- Vehicle note ----------
class TestVehicleNote:
    def _first_vid(self, headers):
        vs = requests.get(f"{BASE}/api/vehicles", headers=headers, timeout=15).json()
        assert vs
        return vs[0]

    def test_put_note_persists(self, admin_h):
        v = self._first_vid(admin_h)
        vid = v["id"]
        original_note = v.get("note")
        new_note = "TEST_NOTE iteration6 - km 123.456 - controllare pneumatici"
        try:
            payload = {
                "targa": v["targa"],
                "marca_modello": v["marca_modello"],
                "data_immatricolazione": v["data_immatricolazione"],
                "bollo_scadenza": v.get("bollo_scadenza"),
                "note": new_note,
            }
            r = requests.put(f"{BASE}/api/vehicles/{vid}", headers=admin_h, json=payload, timeout=15)
            assert r.status_code == 200, r.text
            assert r.json().get("note") == new_note

            # verify persistence
            g = requests.get(f"{BASE}/api/vehicles", headers=admin_h).json()
            found = next(x for x in g if x["id"] == vid)
            assert found.get("note") == new_note
        finally:
            payload = {
                "targa": v["targa"],
                "marca_modello": v["marca_modello"],
                "data_immatricolazione": v["data_immatricolazione"],
                "bollo_scadenza": v.get("bollo_scadenza"),
                "note": original_note,
            }
            requests.put(f"{BASE}/api/vehicles/{vid}", headers=admin_h, json=payload)

    def test_create_vehicle_note_optional(self, admin_h):
        payload = {
            "targa": "ZZ999TT",
            "marca_modello": "TestBrand Model",
            "data_immatricolazione": "2020-01-01",
        }
        r = requests.post(f"{BASE}/api/vehicles", headers=admin_h, json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        vid = r.json()["id"]
        assert r.json().get("note") in (None, "")
        # cleanup
        requests.delete(f"{BASE}/api/vehicles/{vid}", headers=admin_h)

    def test_pdf_contains_note_section(self, admin_h):
        v = self._first_vid(admin_h)
        vid = v["id"]
        original = v.get("note")
        try:
            payload = {
                "targa": v["targa"], "marca_modello": v["marca_modello"],
                "data_immatricolazione": v["data_immatricolazione"],
                "bollo_scadenza": v.get("bollo_scadenza"),
                "note": "UNIQUE_TEST_MARKER_ITER6",
            }
            requests.put(f"{BASE}/api/vehicles/{vid}", headers=admin_h, json=payload)

            r_no = requests.get(f"{BASE}/api/reports/vehicle/{vid}/pdf", headers=admin_h, timeout=60)
            assert r_no.status_code == 200
            size_with = len(r_no.content)

            payload["note"] = None
            requests.put(f"{BASE}/api/vehicles/{vid}", headers=admin_h, json=payload)
            r_empty = requests.get(f"{BASE}/api/reports/vehicle/{vid}/pdf", headers=admin_h, timeout=60)
            assert r_empty.status_code == 200
            size_without = len(r_empty.content)

            # PDF should be larger with note section present
            assert size_with > size_without, f"Expected note to add bytes: with={size_with} without={size_without}"
        finally:
            payload = {
                "targa": v["targa"], "marca_modello": v["marca_modello"],
                "data_immatricolazione": v["data_immatricolazione"],
                "bollo_scadenza": v.get("bollo_scadenza"),
                "note": original,
            }
            requests.put(f"{BASE}/api/vehicles/{vid}", headers=admin_h, json=payload)


# ---------- Regression ----------
class TestRegression:
    def test_auth_me(self, admin_h):
        assert requests.get(f"{BASE}/api/auth/me", headers=admin_h).status_code == 200

    def test_vehicles_list(self, admin_h):
        r = requests.get(f"{BASE}/api/vehicles", headers=admin_h)
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_audit_list(self, admin_h):
        assert requests.get(f"{BASE}/api/audit", headers=admin_h).status_code == 200

    def test_settings_get(self, admin_h):
        r = requests.get(f"{BASE}/api/settings", headers=admin_h)
        assert r.status_code == 200 and "bell_days" in r.json()

    def test_fleet_reports(self, admin_h):
        assert requests.get(f"{BASE}/api/reports/excel", headers=admin_h, timeout=30).status_code == 200
        assert requests.get(f"{BASE}/api/reports/pdf", headers=admin_h, timeout=30).status_code == 200

    def test_operators_list(self, admin_h):
        assert requests.get(f"{BASE}/api/audit/operators", headers=admin_h).status_code == 200
