from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import (FastAPI, APIRouter, HTTPException, Depends, Request, Response,
                     UploadFile, File, Form, Header, Query, BackgroundTasks)
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta, date
import calendar
import uuid
import io
import re
import ipaddress
import secrets as pysecrets
import logging
import bcrypt
import jwt
import httpx
import requests
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
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
GRACE_DAYS = 15  # periodo di comporto assicurativo
POLICY_TYPES = ["annuale", "semestrale", "quadrimestrale", "trimestrale", "mensile", "a_data_fissa"]
GRACE_AUTO_TYPES = {"annuale", "semestrale"}
DOC_TYPES = ["libretto", "carta_circolazione", "polizza", "altro"]

# ---------------- Storage ----------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "fleetcare"
storage_key = None

def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    last = None
    for attempt in range(3):
        key = init_storage(force=(attempt > 0))
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=data, timeout=120)
        if resp.status_code < 400:
            return resp.json()
        last = resp
        if resp.status_code not in (404, 500, 503):
            break
    last.raise_for_status()

def get_object(path: str):
    last = None
    for attempt in range(3):
        key = init_storage(force=(attempt > 0))
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
        if resp.status_code < 400:
            return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
        last = resp
        if resp.status_code not in (404, 500, 503):
            break
    last.raise_for_status()

MIME_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
              "gif": "image/gif", "webp": "image/webp", "pdf": "application/pdf"}
ALLOWED_DOC_EXT = {"pdf", "jpg", "jpeg", "png", "webp"}

# ---------------- Email ----------------
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "FleetCare Autonoleggio")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)

def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)

def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)

class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []
    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []
    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)
    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []

def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Unsafe URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != host {real!r} (G3)")

async def send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    async with httpx.AsyncClient(timeout=30) as c:
        resp = await c.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                            headers={"X-Email-Key": EMAIL_KEY}, json=payload)
    resp.raise_for_status()
    return resp.json().get("id")

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
    importo_premio: Optional[float] = None
    importo_rata: Optional[float] = None
    grace_period: Optional[bool] = False

class VehicleInput(BaseModel):
    targa: str
    marca_modello: str
    data_immatricolazione: str
    bollo_scadenza: Optional[str] = None
    last_collaudo_date: Optional[str] = None

class CollaudoInput(BaseModel):
    data_collaudo: str

class BolloPaymentInput(BaseModel):
    data_pagamento: str
    importo: float
    periodo: Optional[str] = None
    nuova_scadenza: Optional[str] = None
    note: Optional[str] = None

class SettingsInput(BaseModel):
    company_name: Optional[str] = None
    notification_recipients: List[str] = []
    notification_days_before: int = 30

# ---------------- Date / business logic ----------------
def parse_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    return date.fromisoformat(s[:10])

def end_of_month(year: int, month: int) -> date:
    return date(year, month, calendar.monthrange(year, month)[1])

def compute_collaudo_deadline(immatricolazione: str, last_collaudo: Optional[str]) -> Optional[str]:
    lc = parse_date(last_collaudo)
    if lc:
        return end_of_month(lc.year + 2, lc.month).isoformat()
    im = parse_date(immatricolazione)
    if im:
        return end_of_month(im.year + 4, im.month).isoformat()
    return None

def days_status(deadline: Optional[str]):
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

def normalize_policy_suspension(policy: dict) -> bool:
    changed = False
    cumulative = policy.get("cumulative_suspension_days", 0)
    if policy.get("status") == "suspended" and policy.get("current_suspension_start"):
        start = parse_date(policy["current_suspension_start"])
        today = datetime.now(timezone.utc).date()
        ongoing = (today - start).days
        if cumulative + ongoing >= MAX_SUSPENSION_DAYS:
            used = MAX_SUSPENSION_DAYS - cumulative
            policy.setdefault("suspensions", []).append({
                "suspended_at": policy["current_suspension_start"],
                "reactivated_at": today.isoformat(), "days": used, "auto": True})
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
        return min(cumulative + (today - start).days, MAX_SUSPENSION_DAYS)
    return min(cumulative, MAX_SUSPENSION_DAYS)

def grace_applies_to(policy: dict) -> bool:
    return policy.get("tipologia") in GRACE_AUTO_TYPES or bool(policy.get("grace_period"))

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
    today = datetime.now(timezone.utc).date()
    if policy:
        contract = parse_date(policy.get("scadenza_contratto"))
        rata_state, rata_days = days_status(policy.get("scadenza_rata_intermedia"))
        eff_days = effective_suspension_days(policy)
        suspended = policy.get("status") == "suspended"
        limit_reached = policy.get("suspension_limit_reached", False)
        g_applies = grace_applies_to(policy)
        grace_end = contract + timedelta(days=GRACE_DAYS) if (contract and g_applies) else contract

        if suspended:
            insurance_state = "suspended"
            insurance_ok = False
        else:
            base_state, base_days = days_status(policy.get("scadenza_contratto"))
            if contract and today > contract and grace_end and today <= grace_end:
                insurance_state = "grace"
                insurance_ok = True
                insurance_days = (grace_end - today).days
            elif grace_end and today > grace_end:
                insurance_state = "expired"
                insurance_ok = False
                insurance_days = (contract - today).days if contract else None
            else:
                insurance_state = base_state
                insurance_ok = base_state != "expired"
                insurance_days = base_days

        policy_view = {
            "compagnia": policy.get("compagnia"),
            "tipologia": policy.get("tipologia"),
            "data_stipula": policy.get("data_stipula"),
            "scadenza_rata_intermedia": policy.get("scadenza_rata_intermedia"),
            "scadenza_contratto": policy.get("scadenza_contratto"),
            "importo_premio": policy.get("importo_premio"),
            "importo_rata": policy.get("importo_rata"),
            "grace_period": bool(policy.get("grace_period")),
            "grace_applies": g_applies,
            "grace_end": grace_end.isoformat() if grace_end else None,
            "status": policy.get("status", "active"),
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

    docs = [d for d in v.get("documents", []) if not d.get("is_deleted")]
    return {
        **{k: val for k, val in v.items() if k != "documents"},
        "collaudo_deadline": collaudo_deadline,
        "collaudo_state": collaudo_state,
        "collaudo_days": collaudo_days,
        "bollo_state": bollo_state,
        "bollo_days": bollo_days,
        "bollo_history": v.get("bollo_history", []),
        "insurance_state": insurance_state,
        "insurance_days": insurance_days,
        "insurance_state_label": insurance_state,
        "policy": policy_view,
        "documents": docs,
        "can_circulate": can_circulate,
        "collaudo_ok": collaudo_ok,
        "insurance_ok": insurance_ok,
    }

async def get_vehicle_or_404(vehicle_id: str) -> dict:
    v = await db.vehicles.find_one({"id": vehicle_id})
    if not v:
        raise HTTPException(status_code=404, detail="Veicolo non trovato")
    if v.get("policy") and normalize_policy_suspension(v["policy"]):
        await db.vehicles.update_one({"id": vehicle_id}, {"$set": {"policy": v["policy"]}})
    return v

async def get_settings() -> dict:
    s = await db.settings.find_one({"key": "app"})
    if not s:
        s = {"key": "app", "company_name": "FleetCare Autonoleggio",
             "notification_recipients": [], "notification_days_before": 30, "logo_path": None}
        await db.settings.insert_one(dict(s))
    s.pop("_id", None)
    return s

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

# ---------------- Vehicles ----------------
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
    doc["documents"] = []
    doc["bollo_history"] = []
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

# ---------------- Bollo payments ----------------
@api_router.post("/vehicles/{vehicle_id}/bollo")
async def add_bollo_payment(vehicle_id: str, input: BolloPaymentInput, user: dict = Depends(get_current_user)):
    await get_vehicle_or_404(vehicle_id)
    payment = {"id": str(uuid.uuid4()), "data_pagamento": input.data_pagamento,
               "importo": input.importo, "periodo": input.periodo, "note": input.note,
               "created_at": datetime.now(timezone.utc).isoformat()}
    upd = {"$push": {"bollo_history": payment}}
    setd = {}
    if input.nuova_scadenza:
        setd["bollo_scadenza"] = input.nuova_scadenza
    if setd:
        upd["$set"] = setd
    await db.vehicles.update_one({"id": vehicle_id}, upd)
    return build_vehicle_view(await db.vehicles.find_one({"id": vehicle_id}))

@api_router.delete("/vehicles/{vehicle_id}/bollo/{payment_id}")
async def delete_bollo_payment(vehicle_id: str, payment_id: str, user: dict = Depends(get_current_user)):
    await get_vehicle_or_404(vehicle_id)
    await db.vehicles.update_one({"id": vehicle_id}, {"$pull": {"bollo_history": {"id": payment_id}}})
    return build_vehicle_view(await db.vehicles.find_one({"id": vehicle_id}))

# ---------------- Policy ----------------
@api_router.put("/vehicles/{vehicle_id}/policy")
async def set_policy(vehicle_id: str, input: Policy, user: dict = Depends(get_current_user)):
    if input.tipologia not in POLICY_TYPES:
        raise HTTPException(status_code=400, detail="Tipologia polizza non valida")
    v = await get_vehicle_or_404(vehicle_id)
    existing = v.get("policy") or {}
    policy = {
        "compagnia": input.compagnia, "tipologia": input.tipologia,
        "data_stipula": input.data_stipula,
        "scadenza_rata_intermedia": input.scadenza_rata_intermedia,
        "scadenza_contratto": input.scadenza_contratto,
        "importo_premio": input.importo_premio, "importo_rata": input.importo_rata,
        "grace_period": bool(input.grace_period),
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
        "reactivated_at": today.isoformat(), "days": used, "auto": False})
    policy["cumulative_suspension_days"] = new_cumulative
    policy["status"] = "active"
    policy["current_suspension_start"] = None
    if new_cumulative >= MAX_SUSPENSION_DAYS:
        policy["suspension_limit_reached"] = True
    await db.vehicles.update_one({"id": vehicle_id}, {"$set": {"policy": policy}})
    return build_vehicle_view(await db.vehicles.find_one({"id": vehicle_id}))

# ---------------- Documents ----------------
@api_router.post("/vehicles/{vehicle_id}/documents")
async def upload_document(vehicle_id: str, doc_type: str = Form(...), file: UploadFile = File(...),
                          user: dict = Depends(get_current_user)):
    await get_vehicle_or_404(vehicle_id)
    if doc_type not in DOC_TYPES:
        doc_type = "altro"
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin").lower()
    if ext not in ALLOWED_DOC_EXT:
        raise HTTPException(status_code=400, detail="Formato non consentito (solo PDF, JPG, PNG, WEBP)")
    data = await file.read()
    path = f"{APP_NAME}/vehicles/{vehicle_id}/{uuid.uuid4()}.{ext}"
    ct = MIME_TYPES.get(ext, file.content_type or "application/octet-stream")
    result = put_object(path, data, ct)
    doc = {"id": str(uuid.uuid4()), "doc_type": doc_type, "original_filename": file.filename,
           "storage_path": result["path"], "content_type": ct, "size": result.get("size", len(data)),
           "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.vehicles.update_one({"id": vehicle_id}, {"$push": {"documents": doc}})
    return doc

@api_router.delete("/vehicles/{vehicle_id}/documents/{doc_id}")
async def delete_document(vehicle_id: str, doc_id: str, user: dict = Depends(get_current_user)):
    await get_vehicle_or_404(vehicle_id)
    await db.vehicles.update_one({"id": vehicle_id, "documents.id": doc_id},
                                 {"$set": {"documents.$.is_deleted": True}})
    return {"ok": True}

async def _authorize(auth_header: Optional[str]):
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Non autenticato")
    token = auth_header[7:]
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token non valido")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token non valido")

@api_router.get("/files/{path:path}")
async def download_file(path: str, authorization: str = Header(None), auth: str = Query(None)):
    await _authorize(authorization or (f"Bearer {auth}" if auth else None))
    data, content_type = get_object(path)
    return Response(content=data, media_type=content_type)

# ---------------- Settings & logo ----------------
@api_router.get("/settings")
async def read_settings(user: dict = Depends(get_current_user)):
    return await get_settings()

@api_router.put("/settings")
async def update_settings(input: SettingsInput, user: dict = Depends(get_current_user)):
    recipients = [e.strip().lower() for e in input.notification_recipients if e.strip()]
    await db.settings.update_one({"key": "app"}, {"$set": {
        "company_name": input.company_name or "FleetCare Autonoleggio",
        "notification_recipients": recipients,
        "notification_days_before": max(1, int(input.notification_days_before)),
    }}, upsert=True)
    return await get_settings()

@api_router.post("/settings/logo")
async def upload_logo(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "png").lower()
    if ext not in {"png", "jpg", "jpeg", "webp"}:
        raise HTTPException(status_code=400, detail="Il logo deve essere PNG, JPG o WEBP")
    data = await file.read()
    path = f"{APP_NAME}/branding/logo.{ext}"
    ct = MIME_TYPES.get(ext, "image/png")
    result = put_object(path, data, ct)
    await db.settings.update_one({"key": "app"}, {"$set": {"logo_path": result["path"]}}, upsert=True)
    return {"logo_path": result["path"]}

# ---------------- Dashboard & calendar ----------------
@api_router.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    vehicles = await db.vehicles.find().to_list(2000)
    total = can = cannot = suspended = upcoming = 0
    for v in vehicles:
        if v.get("policy"):
            normalize_policy_suspension(v["policy"])
        view = build_vehicle_view(v)
        total += 1
        if view["can_circulate"]:
            can += 1
        else:
            cannot += 1
        if view["policy"] and view["policy"]["status"] == "suspended":
            suspended += 1
        states = [view["collaudo_state"], view["bollo_state"]]
        if view["policy"]:
            states += [view["insurance_state"], view["policy"]["rata_state"]]
        if any(s == "upcoming" for s in states):
            upcoming += 1
    return {"total": total, "can_circulate": can, "cannot_circulate": cannot,
            "suspended": suspended, "upcoming_30": upcoming}

def vehicle_events(view: dict) -> List[dict]:
    ev = []
    if view.get("bollo_scadenza"):
        ev.append({"date": view["bollo_scadenza"], "type": "bollo", "label": "Bollo",
                   "state": view["bollo_state"], "targa": view["targa"], "vehicle_id": view["id"],
                   "marca_modello": view["marca_modello"]})
    if view.get("collaudo_deadline"):
        ev.append({"date": view["collaudo_deadline"], "type": "collaudo", "label": "Collaudo",
                   "state": view["collaudo_state"], "targa": view["targa"], "vehicle_id": view["id"],
                   "marca_modello": view["marca_modello"]})
    p = view.get("policy")
    if p:
        if p.get("scadenza_rata_intermedia"):
            ev.append({"date": p["scadenza_rata_intermedia"], "type": "rata", "label": "Rata polizza",
                       "state": p["rata_state"], "targa": view["targa"], "vehicle_id": view["id"],
                       "marca_modello": view["marca_modello"]})
        if p.get("scadenza_contratto"):
            ev.append({"date": p["scadenza_contratto"], "type": "polizza", "label": "Contratto polizza",
                       "state": view["insurance_state"], "targa": view["targa"], "vehicle_id": view["id"],
                       "marca_modello": view["marca_modello"]})
    return ev

@api_router.get("/deadlines")
async def deadlines(user: dict = Depends(get_current_user)):
    vehicles = await db.vehicles.find().to_list(2000)
    events = []
    for v in vehicles:
        if v.get("policy"):
            normalize_policy_suspension(v["policy"])
        events += vehicle_events(build_vehicle_view(v))
    return events

# ---------------- Reports ----------------
def gather_report_rows(vehicles):
    rows = []
    for v in vehicles:
        if v.get("policy"):
            normalize_policy_suspension(v["policy"])
        view = build_vehicle_view(v)
        p = view["policy"]
        rows.append({
            "Targa": view.get("targa", ""), "Marca/Modello": view.get("marca_modello", ""),
            "Immatricolazione": view.get("data_immatricolazione", ""),
            "Circolazione": "PUO CIRCOLARE" if view["can_circulate"] else "NON PUO CIRCOLARE",
            "Scad. Bollo": view.get("bollo_scadenza") or "-",
            "Scad. Collaudo": view.get("collaudo_deadline") or "-",
            "Compagnia": (p["compagnia"] if p else "-"),
            "Tipo Polizza": (p["tipologia"] if p else "-"),
            "Premio": (f'{p["importo_premio"]:.2f}' if p and p.get("importo_premio") else "-"),
            "Scad. Contratto": (p["scadenza_contratto"] if p else "-"),
            "Comporto 15gg": ("Si" if p and p["grace_applies"] else "No") if p else "-",
            "Stato Polizza": (p["status"] if p else "-"),
            "GG Sospensione": (f'{p["cumulative_suspension_days"]}/{MAX_SUSPENSION_DAYS}' if p else "-"),
        })
    return rows

@api_router.get("/reports/excel")
async def report_excel(user: dict = Depends(get_current_user)):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from openpyxl.drawing.image import Image as XLImage
    settings = await get_settings()
    vehicles = await db.vehicles.find().sort("targa", 1).to_list(2000)
    rows = gather_report_rows(vehicles)
    wb = Workbook()
    ws = wb.active
    ws.title = "Flotta"
    start_row = 1
    if settings.get("logo_path"):
        try:
            content, _ = get_object(settings["logo_path"])
            img = XLImage(io.BytesIO(content))
            img.height = 48; img.width = 48
            ws.add_image(img, "A1")
            ws["B1"] = settings.get("company_name", "FleetCare")
            ws["B1"].font = Font(bold=True, size=14)
            ws.row_dimensions[1].height = 40
            start_row = 3
        except Exception as e:
            logger.warning(f"logo excel skip: {e}")
    else:
        ws.cell(row=1, column=1, value=settings.get("company_name", "FleetCare Autonoleggio")).font = Font(bold=True, size=14)
        start_row = 3
    headers = list(rows[0].keys()) if rows else ["Targa", "Marca/Modello"]
    ws.append([]) if start_row == 3 and ws.max_row < 2 else None
    hr = ws.max_row + 1 if start_row == 3 else 1
    for ci, h in enumerate(headers, 1):
        c = ws.cell(row=hr, column=ci, value=h)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
    for r in rows:
        ws.append([r[h] for h in headers])
    for i, h in enumerate(headers, 1):
        ws.column_dimensions[chr(64 + i)].width = max(14, len(h) + 4)
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    fname = f"flotta_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})

@api_router.get("/reports/pdf")
async def report_pdf(user: dict = Depends(get_current_user)):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
    from reportlab.lib.styles import getSampleStyleSheet
    settings = await get_settings()
    vehicles = await db.vehicles.find().sort("targa", 1).to_list(2000)
    rows = gather_report_rows(vehicles)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), topMargin=1*cm, bottomMargin=1*cm,
                            leftMargin=1*cm, rightMargin=1*cm)
    styles = getSampleStyleSheet()
    elements = []
    if settings.get("logo_path"):
        try:
            content, _ = get_object(settings["logo_path"])
            elements.append(Image(io.BytesIO(content), width=1.6*cm, height=1.6*cm))
        except Exception as e:
            logger.warning(f"logo pdf skip: {e}")
    elements += [Paragraph(settings.get("company_name", "FleetCare Autonoleggio"), styles["Title"]),
                 Paragraph("Scadenziario Flotta Veicoli", styles["Heading2"]),
                 Paragraph(f"Generato il {datetime.now().strftime('%d/%m/%Y %H:%M')}", styles["Normal"]),
                 Spacer(1, 0.4*cm)]
    cols = ["Targa", "Marca/Modello", "Circolazione", "Scad. Bollo", "Scad. Collaudo",
            "Compagnia", "Tipo Polizza", "Premio", "Scad. Contratto", "Comporto 15gg", "Stato Polizza"]
    data = [cols] + [[str(r[c]) for c in cols] for r in rows]
    table = Table(data, repeatRows=1)
    style = [("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
             ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
             ("FONTSIZE", (0, 0), (-1, -1), 7),
             ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
             ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
             ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")])]
    for i, r in enumerate(rows, 1):
        col = colors.HexColor("#E11D48") if r["Circolazione"] == "NON PUO CIRCOLARE" else colors.HexColor("#059669")
        style.append(("TEXTCOLOR", (2, i), (2, i), col))
    table.setStyle(TableStyle(style))
    elements.append(table)
    doc.build(elements)
    buf.seek(0)
    fname = f"scadenziario_{datetime.now().strftime('%Y%m%d')}.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})

# ---------------- Notifications ----------------
async def compute_digest(days_before: int):
    vehicles = await db.vehicles.find().to_list(2000)
    today = datetime.now(timezone.utc).date()
    horizon = today + timedelta(days=days_before)
    items = []
    for v in vehicles:
        if v.get("policy"):
            normalize_policy_suspension(v["policy"])
        for ev in vehicle_events(build_vehicle_view(v)):
            d = parse_date(ev["date"])
            if d and d <= horizon:
                ev["days_left"] = (d - today).days
                items.append(ev)
    items.sort(key=lambda e: e["date"])
    return items

def digest_html(company: str, items: List[dict], days_before: int) -> str:
    rows = ""
    for it in items:
        overdue = it["days_left"] < 0
        color = "#E11D48" if overdue else ("#B45309" if it["days_left"] <= 7 else "#0F172A")
        gg = f'{abs(it["days_left"])} gg fa' if overdue else f'tra {it["days_left"]} gg'
        rows += (f'<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">{escape(it["targa"])}</td>'
                 f'<td style="padding:6px 10px;border-bottom:1px solid #eee">{escape(it["marca_modello"])}</td>'
                 f'<td style="padding:6px 10px;border-bottom:1px solid #eee">{escape(it["label"])}</td>'
                 f'<td style="padding:6px 10px;border-bottom:1px solid #eee">{escape(it["date"])}</td>'
                 f'<td style="padding:6px 10px;border-bottom:1px solid #eee;color:{color};font-weight:bold">{gg}</td></tr>')
    if not rows:
        rows = '<tr><td colspan="5" style="padding:12px;color:#888">Nessuna scadenza nei prossimi giorni.</td></tr>'
    return (f'<table role="presentation" width="100%"><tr><td style="padding:20px;font-family:Arial,sans-serif">'
            f'<h2 style="color:#0F172A;margin:0 0 4px">{escape(company)}</h2>'
            f'<p style="color:#475569;margin:0 0 16px">Riepilogo scadenze flotta — prossimi {days_before} giorni</p>'
            f'<table width="100%" style="border-collapse:collapse;font-size:13px">'
            f'<tr style="background:#0F172A;color:#fff"><th style="padding:6px 10px;text-align:left">Targa</th>'
            f'<th style="padding:6px 10px;text-align:left">Veicolo</th>'
            f'<th style="padding:6px 10px;text-align:left">Scadenza</th>'
            f'<th style="padding:6px 10px;text-align:left">Data</th>'
            f'<th style="padding:6px 10px;text-align:left">Quando</th></tr>{rows}</table>'
            f'<p style="font-size:12px;color:#888;margin-top:16px">Inviato da {escape(EMAIL_FROM_NAME)}. '
            f'Non chiediamo mai password o dati di pagamento via email.</p></td></tr></table>')

async def run_digest():
    settings = await get_settings()
    recipients = settings.get("notification_recipients", [])
    if not recipients:
        return {"sent": 0, "reason": "nessun destinatario configurato", "items": 0}
    days_before = settings.get("notification_days_before", 30)
    items = await compute_digest(days_before)
    company = settings.get("company_name", "FleetCare Autonoleggio")
    html = digest_html(company, items, days_before)
    subject = f"Scadenze flotta — {len(items)} in arrivo ({datetime.now().strftime('%d/%m/%Y')})"
    sent = 0
    for r in recipients:
        try:
            await send_email(to=r, subject=subject, html=html)
            sent += 1
        except Exception as e:
            logger.error(f"digest send to {r} failed: {e}")
    return {"sent": sent, "recipients": recipients, "items": len(items)}

@api_router.post("/notifications/send-now")
async def send_now(user: dict = Depends(get_current_user)):
    return await run_digest()

@api_router.get("/notifications/preview")
async def notifications_preview(user: dict = Depends(get_current_user)):
    settings = await get_settings()
    items = await compute_digest(settings.get("notification_days_before", 30))
    return {"count": len(items), "items": items,
            "recipients": settings.get("notification_recipients", [])}

# ---------------- Cron ----------------
@api_router.post("/cron/deadlines-digest")
async def cron_digest(background_tasks: BackgroundTasks, authorization: str = Header(None)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    provided = authorization[7:] if authorization and authorization.startswith("Bearer ") else ""
    if not secret or not pysecrets.compare_digest(provided, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")
    background_tasks.add_task(run_digest)
    return {"accepted": True}

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
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
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
    await get_settings()

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
