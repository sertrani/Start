"""FleetCare - iteration 8 tests.

Covers:
- Permissions include manage_maintenance
- Vehicle costo_collaudo persistence + undo
- Strategy simulator (until, need_auto/furgone/altro, surplus)
- Suspension plan CRUD (create/list/apply/cancel/delete)
- Strategy reports Excel/PDF
- Strategy alert send-now + settings persistence
- Maintenance types CRUD (defaults 7)
- Maintenance overview + checks + interventions + stats + reports
- Notifications today includes 'manutenzione'
"""
import os
import pytest
import requests
from datetime import date, timedelta

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
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


def _mk_vehicle(auth, targa, tipo="auto", costo=None):
    payload = {"targa": targa, "marca_modello": "IT8Test", "tipo": tipo,
               "data_immatricolazione": "2024-01-01",
               "last_collaudo_date": (date.today() - timedelta(days=30)).isoformat()}
    if costo is not None:
        payload["costo_collaudo"] = costo
    r = auth.post(f"{API}/vehicles", json=payload)
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ---------- Permissions ----------
class TestPermissions:
    def test_manage_maintenance_present(self, auth):
        r = auth.get(f"{API}/auth/permissions")
        assert r.status_code == 200
        perms = r.json()
        # perms could be dict {key: label} or list of dicts
        # Shape: {"permissions": [...], "labels": {key: label}}
        assert isinstance(perms, dict)
        assert "manage_maintenance" in perms.get("permissions", [])
        assert perms.get("labels", {}).get("manage_maintenance") == "Manutenzione e controlli periodici"


# ---------- Vehicle costo_collaudo ----------
class TestCostoCollaudo:
    def test_create_persists_costo(self, auth):
        vid = _mk_vehicle(auth, "TEST_IT8A", costo=175.50)
        try:
            v = auth.get(f"{API}/vehicles/{vid}").json()
            assert v.get("costo_collaudo") == 175.50
            lst = auth.get(f"{API}/vehicles").json()
            match = [x for x in lst if x["id"] == vid][0]
            assert match.get("costo_collaudo") == 175.50
        finally:
            auth.delete(f"{API}/vehicles/{vid}")

    def test_update_and_undo_costo(self, auth):
        vid = _mk_vehicle(auth, "TEST_IT8B", costo=100.0)
        try:
            up = auth.put(f"{API}/vehicles/{vid}", json={
                "targa": "TEST_IT8B", "marca_modello": "IT8Test",
                "data_immatricolazione": "2024-01-01", "tipo": "auto",
                "costo_collaudo": 250.0})
            assert up.status_code == 200, up.text
            assert up.json().get("costo_collaudo") == 250.0
            h = auth.get(f"{API}/vehicles/{vid}/history")
            if h.status_code == 200:
                hist = h.json()
                undoable = [e for e in hist if e.get("action") == "update"
                            and (e.get("prev") or {}).get("costo_collaudo") == 100.0]
                if undoable:
                    u = auth.post(f"{API}/vehicles/{vid}/undo/{undoable[0]['id']}")
                    if u.status_code == 200:
                        v_after = auth.get(f"{API}/vehicles/{vid}").json()
                        assert v_after.get("costo_collaudo") == 100.0
        finally:
            auth.delete(f"{API}/vehicles/{vid}")


# ---------- Strategy simulator ----------
class TestStrategySimulator:
    def test_simulator_shape(self, auth):
        until = (date.today() + timedelta(days=200)).isoformat()
        r = auth.get(f"{API}/strategy", params={"until": until, "need_auto": 1, "need_furgone": 0})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "simulation" in d
        sim = d["simulation"]
        for k in ("until", "total_saving", "count"):
            assert k in sim
        assert sim["until"][:10] == until
        assert d.get("targets", {}).get("auto") == 1
        assert d.get("targets", {}).get("furgone") == 0
        # Every item should have surplus and planned flags
        for it in d["items"]:
            assert "surplus" in it
            assert "planned" in it

    def test_surplus_marks_top_scores_high(self, auth):
        # Get current auto items with active policy
        d = auth.get(f"{API}/strategy", params={"need_auto": 1}).json()
        active_autos = [it for it in d["items"]
                        if it["tipo"] == "auto" and it["policy"]
                        and it["policy"].get("status") != "suspended"]
        active_count = len(active_autos)
        if active_count < 2:
            pytest.skip(f"Not enough active auto policies to test surplus (have {active_count})")
        # Eligible (can_suspend) among them, top score
        surplus_items = [it for it in active_autos if it.get("surplus")]
        # With need=1, surplus should be active_count - 1 for those with can_suspend
        eligible = [it for it in active_autos if it["policy"].get("can_suspend")]
        expected_surplus = max(0, len(eligible) - 1)
        assert len(surplus_items) == expected_surplus, \
            f"expected {expected_surplus} surplus, got {len(surplus_items)}"
        for it in surplus_items:
            assert it["level"] == "high"
            assert "eccedenza" in it["recommendation"].lower()


# ---------- Suspension Plan CRUD ----------
class TestSuspensionPlan:
    def test_full_plan_lifecycle(self, auth):
        # Create vehicle with policy
        vid = _mk_vehicle(auth, "TEST_IT8P", tipo="auto")
        plan_id = None
        try:
            future = (date.today() + timedelta(days=150)).isoformat()
            pr = auth.put(f"{API}/vehicles/{vid}/policy", json={
                "compagnia": "PlanIns", "tipologia": "annuale",
                "data_stipula": "2025-01-01", "scadenza_contratto": future,
                "importo_premio": 800.0})
            assert pr.status_code == 200, pr.text

            sug_from = (date.today() + timedelta(days=10)).isoformat()
            sug_until = (date.today() + timedelta(days=90)).isoformat()
            cr = auth.post(f"{API}/strategy/plan", json={
                "vehicle_id": vid, "suggested_from": sug_from,
                "suggested_until": sug_until, "estimated_saving": 200.0,
                "note": "test plan"})
            assert cr.status_code == 200, cr.text
            plan = cr.json()
            plan_id = plan["id"]
            assert plan["status"] == "planned"
            assert plan.get("targa") == "TEST_IT8P"

            # List
            lst = auth.get(f"{API}/strategy/plan").json()
            mine = [p for p in lst if p["id"] == plan_id][0]
            assert mine.get("marca_modello") == "IT8Test"
            assert mine["status"] == "planned"

            # Apply
            ap = auth.post(f"{API}/strategy/plan/{plan_id}/apply")
            assert ap.status_code == 200, ap.text
            v = auth.get(f"{API}/vehicles/{vid}").json()
            assert v["policy"]["status"] == "suspended"
            lst2 = auth.get(f"{API}/strategy/plan").json()
            mine2 = [p for p in lst2 if p["id"] == plan_id][0]
            assert mine2["status"] == "applied"
        finally:
            if plan_id:
                auth.delete(f"{API}/strategy/plan/{plan_id}")
            auth.delete(f"{API}/vehicles/{vid}")

    def test_cancel_plan(self, auth):
        vid = _mk_vehicle(auth, "TEST_IT8Q")
        plan_id = None
        try:
            future = (date.today() + timedelta(days=150)).isoformat()
            auth.put(f"{API}/vehicles/{vid}/policy", json={
                "compagnia": "X", "tipologia": "annuale",
                "data_stipula": "2025-01-01", "scadenza_contratto": future,
                "importo_premio": 500.0})
            cr = auth.post(f"{API}/strategy/plan", json={"vehicle_id": vid})
            plan_id = cr.json()["id"]
            cn = auth.post(f"{API}/strategy/plan/{plan_id}/cancel")
            assert cn.status_code == 200
            lst = auth.get(f"{API}/strategy/plan").json()
            m = [p for p in lst if p["id"] == plan_id][0]
            assert m["status"] == "cancelled"
            dl = auth.delete(f"{API}/strategy/plan/{plan_id}")
            assert dl.status_code == 200
        finally:
            auth.delete(f"{API}/vehicles/{vid}")


# ---------- Strategy reports ----------
class TestStrategyReports:
    def test_excel_report(self, auth):
        r = auth.get(f"{API}/reports/strategy/excel")
        assert r.status_code == 200
        assert "spreadsheet" in r.headers.get("content-type", "").lower()
        assert len(r.content) > 100

    def test_pdf_report(self, auth):
        r = auth.get(f"{API}/reports/strategy/pdf")
        assert r.status_code == 200
        assert "pdf" in r.headers.get("content-type", "").lower()
        assert r.content[:4] == b"%PDF"


# ---------- Strategy alert + settings ----------
class TestStrategyAlert:
    def test_settings_strategy_fields_persist(self, auth):
        cur = auth.get(f"{API}/settings").json()
        payload = {
            "company_name": cur.get("company_name", "FleetCare Autonoleggio"),
            "notification_recipients": cur.get("notification_recipients", ["delivered@resend.dev"]),
            "notification_days": cur.get("notification_days", {"bollo": 30, "collaudo": 30, "polizza": 30}),
            "season_start_month": cur.get("season_start_month", 4),
            "season_end_month": cur.get("season_end_month", 10),
            "strategy_alert_month": 10,
            "strategy_target_auto": 2,
            "strategy_target_furgone": 1,
            "strategy_target_altro": 0,
        }
        r = auth.put(f"{API}/settings", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["strategy_alert_month"] == 10
        assert d["strategy_target_auto"] == 2
        assert d["strategy_target_furgone"] == 1
        # verify GET reflects
        g = auth.get(f"{API}/settings").json()
        assert g["strategy_alert_month"] == 10
        assert g["strategy_target_auto"] == 2

    def test_send_now_returns_json(self, auth):
        r = auth.post(f"{API}/strategy/alert/send-now")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "sent" in d or "reason" in d


# ---------- Maintenance types ----------
class TestMaintTypes:
    def test_defaults_present(self, auth):
        r = auth.get(f"{API}/maintenance/types")
        assert r.status_code == 200
        types = r.json()
        assert len(types) >= 7
        names = [t["name"] for t in types]
        assert "Olio motore" in names

    def test_crud_type(self, auth):
        cr = auth.post(f"{API}/maintenance/types", json={"name": "TEST_IT8_ctrl", "interval_days": 120})
        assert cr.status_code == 200
        tid = cr.json()["id"]
        up = auth.put(f"{API}/maintenance/types/{tid}", json={"name": "TEST_IT8_ctrl2", "interval_days": 90})
        assert up.status_code == 200
        types = auth.get(f"{API}/maintenance/types").json()
        m = [t for t in types if t["id"] == tid][0]
        assert m["name"] == "TEST_IT8_ctrl2"
        assert m["interval_days"] == 90
        dl = auth.delete(f"{API}/maintenance/types/{tid}")
        assert dl.status_code == 200
        types2 = auth.get(f"{API}/maintenance/types").json()
        assert all(t["id"] != tid for t in types2)


# ---------- Maintenance overview + checks + interventions ----------
class TestMaintFlow:
    def test_overview_and_check_flow(self, auth):
        vid = _mk_vehicle(auth, "TEST_IT8M")
        try:
            ov = auth.get(f"{API}/maintenance/overview").json()
            assert "types" in ov and "vehicles" in ov
            mine = [v for v in ov["vehicles"] if v["vehicle_id"] == vid][0]
            assert len(mine["controls"]) >= 7
            assert all(c["state"] == "never" for c in mine["controls"])
            type_id = ov["types"][0]["id"]
            interval = ov["types"][0]["interval_days"]

            checked = date.today().isoformat()
            cr = auth.post(f"{API}/maintenance/checks", json={
                "vehicle_id": vid, "type_id": type_id, "checked_at": checked, "note": "test"})
            assert cr.status_code == 200, cr.text

            ov2 = auth.get(f"{API}/maintenance/overview").json()
            mine2 = [v for v in ov2["vehicles"] if v["vehicle_id"] == vid][0]
            ctrl = [c for c in mine2["controls"] if c["type_id"] == type_id][0]
            expected_due = (date.today() + timedelta(days=interval)).isoformat()
            assert ctrl["next_due"] == expected_due
            assert ctrl["state"] in ("ok", "upcoming")

            lst = auth.get(f"{API}/maintenance/checks", params={"vehicle_id": vid}).json()
            assert any(c["vehicle_id"] == vid for c in lst)
        finally:
            auth.delete(f"{API}/vehicles/{vid}")

    def test_interventions_flow(self, auth):
        vid = _mk_vehicle(auth, "TEST_IT8I")
        try:
            cr = auth.post(f"{API}/maintenance/interventions", json={
                "vehicle_id": vid, "descrizione": "TEST cambio olio", "note": "n"})
            assert cr.status_code == 200
            iid = cr.json()["id"]
            assert cr.json()["status"] == "open"

            open_list = auth.get(f"{API}/maintenance/interventions", params={"status": "open"}).json()
            assert any(i["id"] == iid for i in open_list)

            cp = auth.post(f"{API}/maintenance/interventions/{iid}/complete", json={
                "done_at": date.today().isoformat(), "costo": 55.5, "note": "done"})
            assert cp.status_code == 200

            done_list = auth.get(f"{API}/maintenance/interventions", params={"status": "done"}).json()
            m = [i for i in done_list if i["id"] == iid][0]
            assert m["costo"] == 55.5
            assert m["status"] == "done"

            st = auth.get(f"{API}/maintenance/stats").json()
            assert "total_cost" in st and "done" in st and "open" in st and "by_vehicle" in st

            dl = auth.delete(f"{API}/maintenance/interventions/{iid}")
            assert dl.status_code == 200
        finally:
            auth.delete(f"{API}/vehicles/{vid}")

    def test_maint_reports(self, auth):
        r = auth.get(f"{API}/reports/maintenance/excel")
        assert r.status_code == 200
        assert "spreadsheet" in r.headers.get("content-type", "").lower()
        r2 = auth.get(f"{API}/reports/maintenance/pdf")
        assert r2.status_code == 200
        assert r2.content[:4] == b"%PDF"


# ---------- Notifications include manutenzione ----------
class TestNotificationsMaint:
    def test_today_supports_manutenzione(self, auth):
        # Create an overdue check by creating vehicle + backdated check on a short-interval type
        vid = _mk_vehicle(auth, "TEST_IT8N")
        try:
            types = auth.get(f"{API}/maintenance/types").json()
            # pick shortest interval
            t = sorted(types, key=lambda x: x["interval_days"])[0]
            past = (date.today() - timedelta(days=t["interval_days"] + 5)).isoformat()
            cr = auth.post(f"{API}/maintenance/checks", json={
                "vehicle_id": vid, "type_id": t["id"], "checked_at": past})
            assert cr.status_code == 200
            r = auth.get(f"{API}/notifications/today")
            assert r.status_code == 200
            data = r.json()
            all_events = (data.get("overdue") or []) + (data.get("today") or []) + (data.get("upcoming") or [])
            types_found = {e.get("type") for e in all_events}
            assert "manutenzione" in types_found, f"'manutenzione' not in events: {types_found}"
        finally:
            auth.delete(f"{API}/vehicles/{vid}")
