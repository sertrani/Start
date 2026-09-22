"""FleetCare - iteration 2 new features tests
Covers: settings CRUD, logo upload, notifications preview & send-now,
cron endpoint auth, vehicle documents (upload/list/view/delete),
bollo history payments, insurance amounts + grace period (annuale auto,
optional for other types) with grace/expired state transitions,
deadlines endpoint (calendar), reports still 200.
"""
import io
import os
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fleet-compliance-25.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "sertrani@gmail.com"
ADMIN_PASSWORD = "fleet2026"
CRON_SECRET = "fc_cron_9b2a7f4e1d6c8350a1e2f7b9c4d80a63"


@pytest.fixture(scope="module")
def auth():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


@pytest.fixture
def temp_vehicle(auth):
    r = auth.post(f"{API}/vehicles", json={
        "targa": "TEST_NF01", "marca_modello": "Test Car",
        "data_immatricolazione": "2024-01-01",
        "last_collaudo_date": (date.today() - timedelta(days=30)).isoformat()
    })
    assert r.status_code == 200, r.text
    vid = r.json()["id"]
    yield vid
    try:
        auth.delete(f"{API}/vehicles/{vid}")
    except Exception:
        pass


# ---------- Settings ----------
class TestSettings:
    def test_get_settings(self, auth):
        r = auth.get(f"{API}/settings")
        assert r.status_code == 200
        d = r.json()
        for k in ["company_name", "notification_recipients", "notification_days_before"]:
            assert k in d

    def test_update_settings_persists(self, auth):
        payload = {"company_name": "TEST_FleetCare Co",
                   "notification_recipients": ["delivered@resend.dev", "ops@example.com"],
                   "notification_days_before": 45}
        r = auth.put(f"{API}/settings", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["company_name"] == "TEST_FleetCare Co"
        assert "delivered@resend.dev" in d["notification_recipients"]
        assert d["notification_days_before"] == 45
        # persist
        g = auth.get(f"{API}/settings").json()
        assert g["notification_days_before"] == 45
        # restore
        auth.put(f"{API}/settings", json={"company_name": "FleetCare Autonoleggio",
                                          "notification_recipients": ["delivered@resend.dev"],
                                          "notification_days_before": 30})

    def test_logo_upload(self, auth):
        from PIL import Image as _PILImage
        _buf = io.BytesIO()
        _PILImage.new("RGB", (64, 64), (0, 30, 60)).save(_buf, "PNG")
        _buf.seek(0)
        files = {"file": ("logo.png", _buf.getvalue(), "image/png")}
        r = auth.post(f"{API}/settings/logo", files=files)
        assert r.status_code == 200, r.text
        assert r.json().get("logo_path")
        # Settings now returns logo_path
        s = auth.get(f"{API}/settings").json()
        assert s.get("logo_path")


# ---------- Notifications & Cron ----------
class TestNotifications:
    def test_preview(self, auth):
        r = auth.get(f"{API}/notifications/preview")
        assert r.status_code == 200
        d = r.json()
        assert "count" in d and "items" in d and "recipients" in d
        assert isinstance(d["items"], list)

    def test_send_now(self, auth):
        # Ensure at least the delivered@resend.dev recipient present
        auth.put(f"{API}/settings", json={"company_name": "FleetCare Autonoleggio",
                                          "notification_recipients": ["delivered@resend.dev"],
                                          "notification_days_before": 30})
        r = auth.post(f"{API}/notifications/send-now")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("sent", 0) >= 1, d

    def test_cron_missing_token(self):
        r = requests.post(f"{API}/cron/deadlines-digest", timeout=15)
        assert r.status_code == 401

    def test_cron_wrong_token(self):
        r = requests.post(f"{API}/cron/deadlines-digest",
                          headers={"Authorization": "Bearer wrong"}, timeout=15)
        assert r.status_code == 401

    def test_cron_correct_token(self):
        r = requests.post(f"{API}/cron/deadlines-digest",
                          headers={"Authorization": f"Bearer {CRON_SECRET}"}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("accepted") is True


# ---------- Documents ----------
class TestDocuments:
    def test_upload_view_delete(self, auth, temp_vehicle):
        vid = temp_vehicle
        # Upload PDF
        pdf_content = b"%PDF-1.4\n%test\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
        r = auth.post(f"{API}/vehicles/{vid}/documents",
                      data={"doc_type": "libretto"},
                      files={"file": ("libretto.pdf", io.BytesIO(pdf_content), "application/pdf")})
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["doc_type"] == "libretto"
        assert doc["storage_path"]
        doc_id = doc["id"]
        path = doc["storage_path"]

        # List via GET /vehicles/{id}
        v = auth.get(f"{API}/vehicles/{vid}").json()
        assert any(d["id"] == doc_id for d in v["documents"])

        # Fetch file
        f = auth.get(f"{API}/files/{path}")
        assert f.status_code == 200
        assert len(f.content) > 0

        # Unauthorized fetch
        u = requests.get(f"{API}/files/{path}", timeout=15)
        assert u.status_code == 401

        # Delete (soft)
        d = auth.delete(f"{API}/vehicles/{vid}/documents/{doc_id}")
        assert d.status_code == 200
        v2 = auth.get(f"{API}/vehicles/{vid}").json()
        assert not any(x["id"] == doc_id for x in v2["documents"])

    def test_upload_invalid_ext(self, auth, temp_vehicle):
        r = auth.post(f"{API}/vehicles/{temp_vehicle}/documents",
                      data={"doc_type": "altro"},
                      files={"file": ("bad.exe", io.BytesIO(b"x"), "application/octet-stream")})
        assert r.status_code == 400


# ---------- Bollo history ----------
class TestBolloHistory:
    def test_add_and_delete_payment(self, auth, temp_vehicle):
        vid = temp_vehicle
        payload = {"data_pagamento": "2026-01-10", "importo": 210.55,
                   "periodo": "2026", "nuova_scadenza": "2027-01-31"}
        r = auth.post(f"{API}/vehicles/{vid}/bollo", json=payload)
        assert r.status_code == 200, r.text
        v = r.json()
        assert v["bollo_scadenza"] == "2027-01-31"
        assert len(v["bollo_history"]) == 1
        pid = v["bollo_history"][0]["id"]
        assert v["bollo_history"][0]["importo"] == 210.55

        d = auth.delete(f"{API}/vehicles/{vid}/bollo/{pid}")
        assert d.status_code == 200
        assert all(p["id"] != pid for p in d.json()["bollo_history"])


# ---------- Insurance amounts & grace period ----------
class TestPolicyAmountsGrace:
    def _mk(self, auth, targa):
        r = auth.post(f"{API}/vehicles", json={
            "targa": targa, "marca_modello": "Grace Car",
            "data_immatricolazione": "2024-01-01",
            "last_collaudo_date": (date.today() - timedelta(days=30)).isoformat()
        })
        assert r.status_code == 200
        return r.json()["id"]

    def test_set_policy_with_amounts_annuale_auto_grace(self, auth):
        vid = self._mk(auth, "TEST_GR01")
        try:
            past5 = (date.today() - timedelta(days=5)).isoformat()
            r = auth.put(f"{API}/vehicles/{vid}/policy", json={
                "compagnia": "TestIns", "tipologia": "annuale",
                "data_stipula": "2025-01-01", "scadenza_contratto": past5,
                "importo_premio": 1200.00, "importo_rata": 300.00,
                "grace_period": False  # Even without checkbox, annuale gets auto grace
            })
            assert r.status_code == 200, r.text
            v = r.json()
            p = v["policy"]
            assert p["importo_premio"] == 1200.00
            assert p["importo_rata"] == 300.00
            assert p["grace_applies"] is True  # auto for annuale
            assert v["insurance_state"] == "grace"
            assert v["can_circulate"] is True  # collaudo valid
        finally:
            auth.delete(f"{API}/vehicles/{vid}")

    def test_annuale_expired_past_grace_blocks(self, auth):
        vid = self._mk(auth, "TEST_GR02")
        try:
            past20 = (date.today() - timedelta(days=20)).isoformat()
            r = auth.put(f"{API}/vehicles/{vid}/policy", json={
                "compagnia": "TestIns", "tipologia": "annuale",
                "data_stipula": "2025-01-01", "scadenza_contratto": past20
            })
            v = r.json()
            assert v["insurance_state"] == "expired"
            assert v["can_circulate"] is False
        finally:
            auth.delete(f"{API}/vehicles/{vid}")

    def test_mensile_no_grace_expires_immediately(self, auth):
        vid = self._mk(auth, "TEST_GR03")
        try:
            past5 = (date.today() - timedelta(days=5)).isoformat()
            r = auth.put(f"{API}/vehicles/{vid}/policy", json={
                "compagnia": "TestIns", "tipologia": "mensile",
                "data_stipula": "2025-01-01", "scadenza_contratto": past5,
                "grace_period": False
            })
            v = r.json()
            assert v["policy"]["grace_applies"] is False
            assert v["insurance_state"] == "expired"
            assert v["can_circulate"] is False
        finally:
            auth.delete(f"{API}/vehicles/{vid}")

    def test_mensile_with_optional_grace_extends(self, auth):
        vid = self._mk(auth, "TEST_GR04")
        try:
            past5 = (date.today() - timedelta(days=5)).isoformat()
            r = auth.put(f"{API}/vehicles/{vid}/policy", json={
                "compagnia": "TestIns", "tipologia": "mensile",
                "data_stipula": "2025-01-01", "scadenza_contratto": past5,
                "grace_period": True
            })
            v = r.json()
            assert v["policy"]["grace_applies"] is True
            assert v["insurance_state"] == "grace"
            assert v["can_circulate"] is True
        finally:
            auth.delete(f"{API}/vehicles/{vid}")


# ---------- Calendar / Deadlines ----------
class TestDeadlines:
    def test_deadlines_shape(self, auth):
        r = auth.get(f"{API}/deadlines")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        if data:
            ev = data[0]
            for k in ["date", "type", "label", "state", "targa", "vehicle_id"]:
                assert k in ev


# ---------- Reports (with logo/company name) ----------
class TestReportsWithBranding:
    def test_excel(self, auth):
        r = auth.get(f"{API}/reports/excel")
        assert r.status_code == 200
        assert len(r.content) > 500

    def test_pdf(self, auth):
        r = auth.get(f"{API}/reports/pdf")
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"
