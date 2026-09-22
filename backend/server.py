from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta, date
import calendar
import uuid
import io
import logging
import bcrypt
import jwt
from bson import ObjectId

# ---------------- DB ----------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
MAX_SUSPENSION_DAYS = 304  # 10 mesi
POLICY_TYPES = ["annuale", "semestrale", "quadrimestrale", "trimestrale", "mensile", "a_data_fissa"]


# ---------------- Auth helpers ----------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Non autenticato")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token non valido")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Utente non trovato")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token scaduto")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token non valido")


# ---------------- Models ----------------
class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = "Operatore"

class LoginInput(BaseModel):
    email: EmailStr
    password: str

class Policy(BaseModel):
    compagnia: str
    tipologia: str
    data_stipula: str
    scadenza_rata_intermedia: Optional[str] = None
    scadenza_contratto: str

class VehicleInput(BaseModel):
    targa: str
    marca_modello: str
    data_immatricolazione: str
    bollo_scadenza: Optional[str] = None
    last_collaudo_date: Optional[str] = None

class CollaudoInput(BaseModel):
    data_collaudo: str


# ---------------- Date / business logic ----------------
def parse_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    return date.fromisoformat(s[:10])

def end_of_month(year: int, month: int) -> date:
    last = calendar.monthrange(year, month)[1]
    return date(year, month, last)

def compute_collaudo_deadline(immatricolazione: str, last_collaudo: Optional[str]) -> Optional[str]:
    lc = parse_date(last_collaudo)
    if lc:
        return end_of_month(lc.year + 2, lc.month).isoformat()
    im = parse_date(immatricolazione)
    if im:
        return end_of_month(im.year + 4, im.month).isoformat()
    return None

def days_status(deadline: Optional[str]):
    """Return (state, days_left). state: valid|upcoming|expired|none"""
    if not deadline:
        return ("none", None)
    d = parse_date(deadline)
    today = datetime.now(timezone.utc).date()
    delta = (d - today).days
    if delta < 0:
        return ("expired", delta)
    if delta <= 30:
        return ("upcoming", delta)
    return ("valid", delta)


def normalize_policy_suspension(policy: dict):
    """Apply auto-reactivation and compute effective cumulative days. Mutates policy, returns changed bool."""
    changed = False
    cumulative = policy.get("cumulative_suspension_days", 0)
    if policy.get("status") == "suspended" and policy.get("current_suspension_start"):
        start = parse_date(policy["current_suspension_start"])
        today = datetime.now(timezone.utc).date()
        ongoing = (today - start).days
        if cumulative + ongoing >= MAX_SUSPENSION_DAYS:
            # auto reactivate, cap
            used = MAX_SUSPENSION_DAYS - cumulative
            policy.setdefault("suspensions", []).append({
                "suspended_at": policy["current_suspension_start"],
                "reactivated_at": today.isoformat(),
                "days": used,
                "auto": True,
            })
            policy["cumulative_suspension_days"] = MAX_SUSPENSION_DAYS
            policy["status"] = "active"
            policy["current_suspension_start"] = None
            policy["suspension_limit_reached"] = True
            changed = True
    return changed


def effective_suspension_days(policy: dict) -> int:
    cumulative = policy.get("cumulative_suspension_days", 0)
    if policy.get("status") == "suspended" and policy.get("current_suspension_start"):
        start = parse_date(policy["current_suspension_start"])
        today = datetime.now(timezone.utc).date()
        ongoing = (today - start).days
        return min(cumulative + ongoing, MAX_SUSPENSION_DAYS)
    return min(cumulative, MAX_SUSPENSION_DAYS)


def build_vehicle_view(v: dict) -> dict:
    v.pop("_id", None)
    collaudo_deadline = compute_collaudo_deadline(v.get("data_immatricolazione"), v.get("last_collaudo_date"))
    collaudo_state, collaudo_days = days_status(collaudo_deadline)
    bollo_state, bollo_days = days_status(v.get("bollo_scadenza"))

    policy = v.get("policy")
    insurance_state = "none"
    insurance_days = None
    policy_view = None
    insurance_ok = False
    if policy:
        contract_state, contract_days = days_status(policy.get("scadenza_contratto"))
        rata_state, rata_days = days_status(policy.get("scadenza_rata_intermedia"))
        eff_days = effective_suspension_days(policy)
        suspended = policy.get("status") == "suspended"
        limit_reached = policy.get("suspension_limit_reached", False)
        if suspended:
            insurance_state = "suspended"
        else:
            insurance_state = contract_state
        insurance_days = contract_days
        insurance_ok = (contract_state != "expired") and (not suspended)
        policy_view = {
            "compagnia": policy.get("compagnia"),
            "tipologia": policy.get("tipologia"),
            "data_stipula": policy.get("data_stipula"),
            "scadenza_rata_intermedia": policy.get("scadenza_rata_intermedia"),
            "scadenza_contratto": policy.get("scadenza_contratto"),
            "status": policy.get("status", "active"),
            "contract_state": contract_state,
            "contract_days": contract_days,
            "rata_state": rata_state,
            "rata_days": rata_days,
            "cumulative_suspension_days": eff_days,
            "max_suspension_days": MAX_SUSPENSION_DAYS,
            "suspension_limit_reached": limit_reached,
            "current_suspension_start": policy.get("current_suspension_start"),
            "suspensions": policy.get("suspensions", []),
            "can_suspend": (not suspended) and (not limit_reached) and eff_days < MAX_SUSPENSION_DAYS,
        }

    collaudo_ok = collaudo_state != "expired"
    can_circulate = insurance_ok and collaudo_ok

    return {
        **v,
        "collaudo_deadline": collaudo_deadline,
        "collaudo_state": collaudo_state,
        "collaudo_days": collaudo_days,
        "bollo_state": bollo_state,
        "bollo_days": bollo_days,
        "insurance_state": insurance_state,
        "insurance_days": insurance_days,
        "policy": policy_view,
        "can_circulate": can_circulate,
        "collaudo_ok": collaudo_ok,
        "insurance_ok": insurance_ok,
    }


async def get_vehicle_or_404(vehicle_id: str) -> dict:
    v = await db.vehicles.find_one({"id": vehicle_id})
    if not v:
        raise HTTPException(status_code=404, detail="Veicolo non trovato")
    # apply auto reactivation persistence
    if v.get("policy"):
        if normalize_policy_suspension(v["policy"]):
            await db.vehicles.update_one({"id": vehicle_id}, {"$set": {"policy": v["policy"]}})
    return v


# ---------------- Auth endpoints ----------------
@api_router.post("/auth/register")
async def register(input: RegisterInput, response: Response):
    email = input.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email già registrata")
    doc = {"email": email, "password_hash": hash_password(input.password),
           "name": input.name, "role": "user", "created_at": datetime.now(timezone.utc).isoformat()}
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    token = create_access_token(uid, email)
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    return {"token": token, "user": {"id": uid, "email": email, "name": input.name, "role": "user"}}


@api_router.post("/auth/login")
async def login(input: LoginInput, response: Response):
    email = input.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(input.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    uid = str(user["_id"])
    token = create_access_token(uid, email)
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    return {"token": token, "user": {"id": uid, "email": email, "name": user.get("name"), "role": user.get("role")}}


@api_router.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"id": user["_id"], "email": user["email"], "name": user.get("name"), "role": user.get("role")}


# ---------------- Vehicle endpoints ----------------
@api_router.get("/vehicles")
async def list_vehicles(user: dict = Depends(get_current_user)):
    vehicles = await db.vehicles.find().sort("created_at", -1).to_list(2000)
    out = []
    for v in vehicles:
        if v.get("policy") and normalize_policy_suspension(v["policy"]):
            await db.vehicles.update_one({"id": v["id"]}, {"$set": {"policy": v["policy"]}})
        out.append(build_vehicle_view(v))
    return out


@api_router.post("/vehicles")
async def create_vehicle(input: VehicleInput, user: dict = Depends(get_current_user)):
    doc = input.model_dump()
    doc["targa"] = doc["targa"].upper().strip()
    doc["id"] = str(uuid.uuid4())
    doc["policy"] = None
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.vehicles.insert_one(doc)
    return build_vehicle_view(await db.vehicles.find_one({"id": doc["id"]}))


@api_router.get("/vehicles/{vehicle_id}")
async def get_vehicle(vehicle_id: str, user: dict = Depends(get_current_user)):
    return build_vehicle_view(await get_vehicle_or_404(vehicle_id))


@api_router.put("/vehicles/{vehicle_id}")
async def update_vehicle(vehicle_id: str, input: VehicleInput, user: dict = Depends(get_current_user)):
    await get_vehicle_or_404(vehicle_id)
    upd = input.model_dump()
    upd["targa"] = upd["targa"].upper().strip()
    await db.vehicles.update_one({"id": vehicle_id}, {"$set": upd})
    return build_vehicle_view(await db.vehicles.find_one({"id": vehicle_id}))


@api_router.delete("/vehicles/{vehicle_id}")
async def delete_vehicle(vehicle_id: str, user: dict = Depends(get_current_user)):
    await get_vehicle_or_404(vehicle_id)
    await db.vehicles.delete_one({"id": vehicle_id})
    return {"ok": True}


@api_router.put("/vehicles/{vehicle_id}/collaudo")
async def register_collaudo(vehicle_id: str, input: CollaudoInput, user: dict = Depends(get_current_user)):
    await get_vehicle_or_404(vehicle_id)
    await db.vehicles.update_one({"id": vehicle_id}, {"$set": {"last_collaudo_date": input.data_collaudo}})
    return build_vehicle_view(await db.vehicles.find_one({"id": vehicle_id}))


# ---------------- Insurance policy ----------------
@api_router.put("/vehicles/{vehicle_id}/policy")
async def set_policy(vehicle_id: str, input: Policy, user: dict = Depends(get_current_user)):
    if input.tipologia not in POLICY_TYPES:
        raise HTTPException(status_code=400, detail="Tipologia polizza non valida")
    v = await get_vehicle_or_404(vehicle_id)
    existing = v.get("policy") or {}
    policy = {
        "compagnia": input.compagnia,
        "tipologia": input.tipologia,
        "data_stipula": input.data_stipula,
        "scadenza_rata_intermedia": input.scadenza_rata_intermedia,
        "scadenza_contratto": input.scadenza_contratto,
        # preserve suspension tracking across edits
        "status": existing.get("status", "active"),
        "cumulative_suspension_days": existing.get("cumulative_suspension_days", 0),
        "current_suspension_start": existing.get("current_suspension_start"),
        "suspensions": existing.get("suspensions", []),
        "suspension_limit_reached": existing.get("suspension_limit_reached", False),
    }
    await db.vehicles.update_one({"id": vehicle_id}, {"$set": {"policy": policy}})
    return build_vehicle_view(await db.vehicles.find_one({"id": vehicle_id}))


@api_router.post("/vehicles/{vehicle_id}/policy/suspend")
async def suspend_policy(vehicle_id: str, user: dict = Depends(get_current_user)):
    v = await get_vehicle_or_404(vehicle_id)
    policy = v.get("policy")
    if not policy:
        raise HTTPException(status_code=400, detail="Nessuna polizza da sospendere")
    if policy.get("status") == "suspended":
        raise HTTPException(status_code=400, detail="Polizza già sospesa")
    if policy.get("suspension_limit_reached") or policy.get("cumulative_suspension_days", 0) >= MAX_SUSPENSION_DAYS:
        raise HTTPException(status_code=400, detail="Limite massimo di sospensione (10 mesi) raggiunto")
    policy["status"] = "suspended"
    policy["current_suspension_start"] = datetime.now(timezone.utc).date().isoformat()
    await db.vehicles.update_one({"id": vehicle_id}, {"$set": {"policy": policy}})
    return build_vehicle_view(await db.vehicles.find_one({"id": vehicle_id}))


@api_router.post("/vehicles/{vehicle_id}/policy/reactivate")
async def reactivate_policy(vehicle_id: str, user: dict = Depends(get_current_user)):
    v = await get_vehicle_or_404(vehicle_id)
    policy = v.get("policy")
    if not policy or policy.get("status") != "suspended":
        raise HTTPException(status_code=400, detail="La polizza non è sospesa")
    start = parse_date(policy["current_suspension_start"])
    today = datetime.now(timezone.utc).date()
    days = (today - start).days
    cumulative = policy.get("cumulative_suspension_days", 0)
    new_cumulative = min(cumulative + days, MAX_SUSPENSION_DAYS)
    used = new_cumulative - cumulative
    policy.setdefault("suspensions", []).append({
        "suspended_at": policy["current_suspension_start"],
        "reactivated_at": today.isoformat(),
        "days": used,
        "auto": False,
    })
    policy["cumulative_suspension_days"] = new_cumulative
    policy["status"] = "active"
    policy["current_suspension_start"] = None
    if new_cumulative >= MAX_SUSPENSION_DAYS:
        policy["suspension_limit_reached"] = True
    await db.vehicles.update_one({"id": vehicle_id}, {"$set": {"policy": policy}})
    return build_vehicle_view(await db.vehicles.find_one({"id": vehicle_id}))


# ---------------- Dashboard ----------------
@api_router.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    vehicles = await db.vehicles.find().to_list(2000)
    total = len(vehicles)
    can = cannot = suspended = upcoming = 0
    for v in vehicles:
        if v.get("policy"):
            normalize_policy_suspension(v["policy"])
        view = build_vehicle_view(v)
        if view["can_circulate"]:
            can += 1
        else:
            cannot += 1
        if view["policy"] and view["policy"]["status"] == "suspended":
            suspended += 1
        for st in [view["collaudo_state"], view["bollo_state"],
                   (view["policy"]["contract_state"] if view["policy"] else "none"),
                   (view["policy"]["rata_state"] if view["policy"] else "none")]:
            if st == "upcoming":
                upcoming += 1
                break
    return {"total": total, "can_circulate": can, "cannot_circulate": cannot,
            "suspended": suspended, "upcoming_30": upcoming}


# ---------------- Reports ----------------
def gather_report_rows(vehicles):
    rows = []
    for v in vehicles:
        if v.get("policy"):
            normalize_policy_suspension(v["policy"])
        view = build_vehicle_view(v)
        p = view["policy"]
        rows.append({
            "Targa": view.get("targa", ""),
            "Marca/Modello": view.get("marca_modello", ""),
            "Immatricolazione": view.get("data_immatricolazione", ""),
            "Circolazione": "PUÒ CIRCOLARE" if view["can_circulate"] else "NON PUÒ CIRCOLARE",
            "Scad. Bollo": view.get("bollo_scadenza") or "-",
            "Scad. Collaudo": view.get("collaudo_deadline") or "-",
            "Compagnia": (p["compagnia"] if p else "-"),
            "Tipo Polizza": (p["tipologia"] if p else "-"),
            "Scad. Contratto": (p["scadenza_contratto"] if p else "-"),
            "Scad. Rata": (p["scadenza_rata_intermedia"] if p and p["scadenza_rata_intermedia"] else "-"),
            "Stato Polizza": (p["status"] if p else "-"),
            "GG Sospensione": (f'{p["cumulative_suspension_days"]}/{MAX_SUSPENSION_DAYS}' if p else "-"),
        })
    return rows


@api_router.get("/reports/excel")
async def report_excel(user: dict = Depends(get_current_user)):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    vehicles = await db.vehicles.find().sort("targa", 1).to_list(2000)
    rows = gather_report_rows(vehicles)
    wb = Workbook()
    ws = wb.active
    ws.title = "Flotta"
    headers = list(rows[0].keys()) if rows else ["Targa", "Marca/Modello"]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
    for r in rows:
        ws.append([r[h] for h in headers])
    for i, h in enumerate(headers, 1):
        ws.column_dimensions[chr(64 + i)].width = max(14, len(h) + 4)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"flotta_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})


@api_router.get("/reports/pdf")
async def report_pdf(user: dict = Depends(get_current_user)):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    vehicles = await db.vehicles.find().sort("targa", 1).to_list(2000)
    rows = gather_report_rows(vehicles)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), topMargin=1*cm, bottomMargin=1*cm,
                            leftMargin=1*cm, rightMargin=1*cm)
    styles = getSampleStyleSheet()
    elements = [Paragraph("Scadenziario Flotta Veicoli", styles["Title"]),
                Paragraph(f"Generato il {datetime.now().strftime('%d/%m/%Y %H:%M')}", styles["Normal"]),
                Spacer(1, 0.4*cm)]
    cols = ["Targa", "Marca/Modello", "Circolazione", "Scad. Bollo", "Scad. Collaudo",
            "Compagnia", "Tipo Polizza", "Scad. Contratto", "Stato Polizza", "GG Sospensione"]
    data = [cols]
    for r in rows:
        data.append([str(r[c]) for c in cols])
    table = Table(data, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
    ]
    for i, r in enumerate(rows, 1):
        if r["Circolazione"] == "NON PUÒ CIRCOLARE":
            style.append(("TEXTCOLOR", (2, i), (2, i), colors.HexColor("#E11D48")))
        else:
            style.append(("TEXTCOLOR", (2, i), (2, i), colors.HexColor("#059669")))
    table.setStyle(TableStyle(style))
    elements.append(table)
    doc.build(elements)
    buf.seek(0)
    fname = f"scadenziario_{datetime.now().strftime('%Y%m%d')}.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})


@api_router.get("/")
async def root():
    return {"message": "FleetCare API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.vehicles.create_index("id", unique=True)
    admin_email = os.environ.get("ADMIN_EMAIL", "").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if admin_email and admin_password:
        existing = await db.users.find_one({"email": admin_email})
        if existing is None:
            await db.users.insert_one({"email": admin_email, "password_hash": hash_password(admin_password),
                                       "name": "Titolare", "role": "admin",
                                       "created_at": datetime.now(timezone.utc).isoformat()})
        elif not verify_password(admin_password, existing["password_hash"]):
            await db.users.update_one({"email": admin_email},
                                      {"$set": {"password_hash": hash_password(admin_password)}})


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
