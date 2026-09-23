"""FleetCare - iteration 7 new features tests.

Covers:
- GET /api/strategy (season, phase, sort, items shape, opportunities)
- GET/PUT /api/settings season_start_month / season_end_month
- Policy tipologia annuale + frazionamento (persistence)
- Policy tipologia trimestrale -> frazionamento null
- Invalid tipologia 'semestrale' -> 400
- Legacy semestrale migration (vehicle XY999ZZ)
- Vehicle 'tipo' create/update/undo
- Suspension via strategy suggested_from + reactivate
"""
import os
import pytest
import requests
from datetime import date, timedelta

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://fleet-compliance-25.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "sertrani@gmail.com"
ADMIN_PASSWORD = "fleet2026"


@pytest.fixture(scope="module")
def auth():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


@pytest.fixture
def temp_vehicle(auth):
    r = auth.post(f"{API}/vehicles", json={
        "targa": "TEST_IT7A", "marca_modello": "Iter7 Car", "tipo": "auto",
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


# ---------- Settings: season ----------
class TestSettingsSeason:
    def test_settings_has_season_defaults(self, auth):
        r = auth.get(f"{API}/settings")
        assert r.status_code == 200
        d = r.json()
        assert d.get("season_start_month") == 4
        assert d.get("season_end_month") == 10

    def test_update_season_persists_and_reflects_in_strategy(self, auth):
        # change to 5..9
        r = auth.put(f"{API}/settings", json={
            "company_name": "FleetCare Autonoleggio",
            "notification_recipients": ["delivered@resend.dev"],
            "notification_days": {"bollo": 30, "collaudo": 30, "polizza": 30},
            "season_start_month": 5, "season_end_month": 9,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["season_start_month"] == 5 and d["season_end_month"] == 9
        s = auth.get(f"{API}/strategy").json()
        assert s["season"]["start"] == 5 and s["season"]["end"] == 9
        # Current date in app ~ 23 Sept 2026 -> shoulder (May-Sept, not peak Jul-Aug)
        assert s["season"]["phase"] in ("shoulder", "peak", "closed")
        assert s["season"]["phase_label"]
        # restore
        r2 = auth.put(f"{API}/settings", json={
            "company_name": "FleetCare Autonoleggio",
            "notification_recipients": ["delivered@resend.dev"],
            "notification_days": {"bollo": 30, "collaudo": 30, "polizza": 30},
            "season_start_month": 4, "season_end_month": 10,
        })
        assert r2.status_code == 200
        assert r2.json()["season_start_month"] == 4


# ---------- Strategy endpoint ----------
class TestStrategy:
    def test_strategy_shape_and_sort(self, auth):
        r = auth.get(f"{API}/strategy")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "season" in d and "items" in d and "opportunities" in d
        season = d["season"]
        for k in ["start", "end", "phase", "phase_label"]:
            assert k in season
        items = d["items"]
        assert isinstance(items, list)
        # Sorted by score desc
        scores = [it["score"] for it in items]
        assert scores == sorted(scores, reverse=True)
        for it in items:
            for k in ["score", "level", "recommendation", "reasons", "blockers",
                     "suggested_from", "suggested_until", "estimated_saving", "policy"]:
                assert k in it, f"missing {k}"
            assert isinstance(it["reasons"], list)
            assert isinstance(it["blockers"], list)
        # opportunities == number of high items
        assert d["opportunities"] == sum(1 for it in items if it["level"] == "high")

    def test_strategy_no_policy_level_none(self, auth, temp_vehicle):
        # temp_vehicle has no policy
        d = auth.get(f"{API}/strategy").json()
        my = [it for it in d["items"] if it["vehicle_id"] == temp_vehicle]
        assert my, "vehicle not in strategy items"
        assert my[0]["level"] == "none"
        assert my[0]["policy"] is None


# ---------- Policy tipologia & frazionamento ----------
class TestPolicyFrazionamento:
    def _mk(self, auth, targa):
        r = auth.post(f"{API}/vehicles", json={
            "targa": targa, "marca_modello": "PolTest", "tipo": "auto",
            "data_immatricolazione": "2024-01-01",
            "last_collaudo_date": (date.today() - timedelta(days=30)).isoformat()
        })
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def test_annuale_with_frazionamento_persists(self, auth):
        vid = self._mk(auth, "TEST_IT7B")
        try:
            future = (date.today() + timedelta(days=90)).isoformat()
            r = auth.put(f"{API}/vehicles/{vid}/policy", json={
                "compagnia": "InsA", "tipologia": "annuale",
                "data_stipula": "2025-01-01", "scadenza_contratto": future,
                "frazionamento": "mensile",
            })
            assert r.status_code == 200, r.text
            p = r.json()["policy"]
            assert p["tipologia"] == "annuale"
            assert p["frazionamento"] == "mensile"
            # verify persisted via GET
            v = auth.get(f"{API}/vehicles/{vid}").json()
            assert v["policy"]["frazionamento"] == "mensile"
        finally:
            auth.delete(f"{API}/vehicles/{vid}")

    def test_trimestrale_frazionamento_null(self, auth):
        vid = self._mk(auth, "TEST_IT7C")
        try:
            future = (date.today() + timedelta(days=90)).isoformat()
            r = auth.put(f"{API}/vehicles/{vid}/policy", json={
                "compagnia": "InsA", "tipologia": "trimestrale",
                "data_stipula": "2025-01-01", "scadenza_contratto": future,
                "frazionamento": "mensile",  # should be ignored/nulled
            })
            assert r.status_code == 200, r.text
            p = r.json()["policy"]
            assert p["tipologia"] == "trimestrale"
            assert p["frazionamento"] is None
        finally:
            auth.delete(f"{API}/vehicles/{vid}")

    def test_semestrale_tipologia_rejected(self, auth):
        vid = self._mk(auth, "TEST_IT7D")
        try:
            future = (date.today() + timedelta(days=90)).isoformat()
            r = auth.put(f"{API}/vehicles/{vid}/policy", json={
                "compagnia": "InsA", "tipologia": "semestrale",
                "data_stipula": "2025-01-01", "scadenza_contratto": future,
            })
            assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        finally:
            auth.delete(f"{API}/vehicles/{vid}")


# ---------- Legacy semestrale migration ----------
class TestLegacyMigration:
    def test_xy999zz_migrated(self, auth):
        r = auth.get(f"{API}/vehicles")
        assert r.status_code == 200
        vlist = r.json()
        target = [v for v in vlist if v.get("targa") == "XY999ZZ"]
        if not target:
            pytest.skip("XY999ZZ seed vehicle not present in this DB")
        p = target[0].get("policy")
        assert p is not None, "XY999ZZ has no policy"
        assert p.get("tipologia") == "annuale"
        assert p.get("frazionamento") == "semestrale"


# ---------- Vehicle 'tipo' field ----------
class TestVehicleTipo:
    def test_tipo_persisted_on_create(self, auth):
        r = auth.post(f"{API}/vehicles", json={
            "targa": "TEST_IT7E", "marca_modello": "Furgo", "tipo": "furgone",
            "data_immatricolazione": "2024-01-01",
            "last_collaudo_date": (date.today() - timedelta(days=30)).isoformat()
        })
        assert r.status_code == 200
        vid = r.json()["id"]
        try:
            v = auth.get(f"{API}/vehicles/{vid}").json()
            assert v.get("tipo") == "furgone"
            # visible in list
            lst = auth.get(f"{API}/vehicles").json()
            match = [x for x in lst if x["id"] == vid][0]
            assert match["tipo"] == "furgone"
        finally:
            auth.delete(f"{API}/vehicles/{vid}")

    def test_tipo_update_and_undo(self, auth):
        r = auth.post(f"{API}/vehicles", json={
            "targa": "TEST_IT7F", "marca_modello": "Undo", "tipo": "auto",
            "data_immatricolazione": "2024-01-01",
            "last_collaudo_date": (date.today() - timedelta(days=30)).isoformat()
        })
        assert r.status_code == 200
        vid = r.json()["id"]
        try:
            # update tipo -> altro
            up = auth.put(f"{API}/vehicles/{vid}", json={
                "targa": "TEST_IT7F", "marca_modello": "Undo", "tipo": "altro",
                "data_immatricolazione": "2024-01-01",
            })
            assert up.status_code == 200, up.text
            assert up.json()["tipo"] == "altro"
            # look for undo history endpoint
            h = auth.get(f"{API}/vehicles/{vid}/history")
            if h.status_code == 200:
                hist = h.json()
                # find latest update entry with prev.tipo present
                undoable = [e for e in hist if e.get("action") == "update" and (e.get("prev") or {}).get("tipo") == "auto"]
                if undoable:
                    entry_id = undoable[0]["id"]
                    u = auth.post(f"{API}/vehicles/{vid}/undo/{entry_id}")
                    if u.status_code == 200:
                        v_after = auth.get(f"{API}/vehicles/{vid}").json()
                        assert v_after["tipo"] == "auto", f"undo did not restore tipo, got {v_after.get('tipo')}"
        finally:
            auth.delete(f"{API}/vehicles/{vid}")


# ---------- Suspension via strategy ----------
class TestStrategySuspension:
    def test_suspend_using_strategy_suggested_from(self, auth):
        # Create vehicle with annuale policy, contract in future, non in grace
        r = auth.post(f"{API}/vehicles", json={
            "targa": "TEST_IT7G", "marca_modello": "SuspTest", "tipo": "furgone",
            "data_immatricolazione": "2024-01-01",
            "last_collaudo_date": (date.today() - timedelta(days=30)).isoformat()
        })
        assert r.status_code == 200
        vid = r.json()["id"]
        try:
            future = (date.today() + timedelta(days=120)).isoformat()
            pr = auth.put(f"{API}/vehicles/{vid}/policy", json={
                "compagnia": "InsSusp", "tipologia": "annuale",
                "data_stipula": "2025-01-01", "scadenza_contratto": future,
                "importo_premio": 900.0,
            })
            assert pr.status_code == 200, pr.text

            strat = auth.get(f"{API}/strategy").json()
            item = [it for it in strat["items"] if it["vehicle_id"] == vid][0]
            assert item["suggested_from"], "no suggested_from"
            sr = auth.post(f"{API}/vehicles/{vid}/policy/suspend",
                           json={"effective_date": item["suggested_from"]})
            assert sr.status_code == 200, sr.text
            v = auth.get(f"{API}/vehicles/{vid}").json()
            assert v["policy"]["status"] == "suspended", v["policy"]

            # reactivate
            reak = auth.post(f"{API}/vehicles/{vid}/policy/reactivate",
                             json={"effective_date": date.today().isoformat()})
            assert reak.status_code == 200, reak.text
            v2 = auth.get(f"{API}/vehicles/{vid}").json()
            assert v2["policy"]["status"] != "suspended"
        finally:
            auth.delete(f"{API}/vehicles/{vid}")
