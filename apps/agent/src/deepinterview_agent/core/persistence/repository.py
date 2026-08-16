"""Session persistence.

The :class:`SessionRepository` protocol is the storage contract used by the prep
and post pipelines. :class:`MemoryRepository` is the default (a process-wide
singleton so a session written during ``POST /api/prep`` is visible to later
reads in the same process). :class:`FirestoreRepository` is the production store: a
Firebase Firestore ``sessions`` collection, lazy-importing
``google-cloud-firestore``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable
from uuid import uuid4

from ...api.views import SessionView
from ...shared_models import AnswerRecord, InterviewContext, PrepRequest, ScoreCard
from ..logging import get_logger

if TYPE_CHECKING:
    from ..config import Settings

log = get_logger(__name__)


def _new_session_id() -> str:
    return f"sess_{uuid4().hex}"


@runtime_checkable
class SessionRepository(Protocol):
    """Storage contract for interview sessions."""

    async def create_session(self, req: PrepRequest) -> str: ...

    async def save_context(self, session_id: str, ctx: InterviewContext) -> None: ...

    async def load_context(self, session_id: str) -> InterviewContext | None: ...

    async def update_status(self, session_id: str, status: str) -> None: ...

    async def append_answer(self, session_id: str, a: AnswerRecord) -> None: ...

    async def save_scorecard(self, session_id: str, sc: ScoreCard) -> None: ...

    async def save_transcript(self, session_id: str, turns: list[dict]) -> None: ...

    async def save_coach_transcript(self, session_id: str, turns: list[dict]) -> None: ...

    async def mark_progress(self, session_id: str, step: str) -> None: ...

    async def add_warnings(self, session_id: str, warnings: list[str]) -> None: ...

    async def get_session_view(self, session_id: str) -> SessionView | None: ...


@dataclass
class _SessionRow:
    id: str
    status: str = "prep"
    # Owning user (Firebase Auth uid); None for the offline/dev path.
    user_id: str | None = None
    company: str | None = None
    cv_url: str | None = None
    jd_text: str | None = None
    language_mode: dict[str, Any] = field(default_factory=lambda: {"primary": "en", "mixed": False})
    context: dict[str, Any] | None = None
    scorecard: dict[str, Any] | None = None
    transcript: list[dict] | None = None
    # Spoken study-coach conversation — SEPARATE from the interview transcript
    # so a post-interview coach session can never overwrite the interview record.
    coach_transcript: list[dict] | None = None
    answers: list[dict] = field(default_factory=list)
    progress: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class MemoryRepository:
    """In-memory repository. Status is tracked per row for test inspection."""

    def __init__(self) -> None:
        self._rows: dict[str, _SessionRow] = {}

    async def create_session(self, req: PrepRequest) -> str:
        session_id = _new_session_id()
        self._rows[session_id] = _SessionRow(
            id=session_id,
            status="prep",
            user_id=req.user_id,
            company=req.company,
            cv_url=req.cv_url,
            jd_text=req.jd_text,
            language_mode=req.language_mode.model_dump(),
        )
        return session_id

    async def save_context(self, session_id: str, ctx: InterviewContext) -> None:
        row = self._require(session_id)
        row.context = ctx.model_dump()

    async def load_context(self, session_id: str) -> InterviewContext | None:
        row = self._rows.get(session_id)
        if row is None or row.context is None:
            return None
        return InterviewContext.model_validate(row.context)

    async def update_status(self, session_id: str, status: str) -> None:
        self._require(session_id).status = status

    async def append_answer(self, session_id: str, a: AnswerRecord) -> None:
        row = self._require(session_id)
        row.answers.append(a.model_dump())
        # Persist into the canonical context too, so load_context() sees the
        # appended answer (mirrors FirestoreRepository).
        if row.context is not None:
            ctx = InterviewContext.model_validate(row.context)
            ctx.answers.append(a)
            row.context = ctx.model_dump()

    async def save_scorecard(self, session_id: str, sc: ScoreCard) -> None:
        self._require(session_id).scorecard = sc.model_dump()

    async def save_transcript(self, session_id: str, turns: list[dict]) -> None:
        self._require(session_id).transcript = list(turns)

    async def save_coach_transcript(self, session_id: str, turns: list[dict]) -> None:
        self._require(session_id).coach_transcript = list(turns)

    async def mark_progress(self, session_id: str, step: str) -> None:
        row = self._require(session_id)
        if step not in row.progress:
            row.progress.append(step)

    async def add_warnings(self, session_id: str, warnings: list[str]) -> None:
        row = self._require(session_id)
        for w in warnings:
            if w not in row.warnings:
                row.warnings.append(w)

    async def get_session_view(self, session_id: str) -> SessionView | None:
        row = self._rows.get(session_id)
        if row is None:
            return None
        context = (
            InterviewContext.model_validate(row.context) if row.context else None
        )
        scorecard = (
            ScoreCard.model_validate(row.scorecard) if row.scorecard else None
        )
        return SessionView(
            session_id=row.id,
            status=row.status,
            progress=list(row.progress),
            prep_warnings=list(row.warnings),
            context=context,
            scorecard=scorecard,
        )

    # --- test / inspection helpers (not part of the protocol) ----------------
    def get_status(self, session_id: str) -> str | None:
        row = self._rows.get(session_id)
        return row.status if row else None

    def _require(self, session_id: str) -> _SessionRow:
        row = self._rows.get(session_id)
        if row is None:
            raise KeyError(f"Unknown session_id: {session_id}")
        return row


class FirestoreRepository:
    """Persist sessions to a Firestore ``sessions`` collection (lazy SDK import).

    One document per session, keyed by ``session_id``. Firestore stores
    maps/arrays natively, so ``context``/``scorecard``/``transcript`` go in
    as-is with no JSON encoding.

    Credentials: an explicit service-account JSON path
    (``FIREBASE_CREDENTIALS_PATH``) when set, otherwise Application Default
    Credentials (``GOOGLE_APPLICATION_CREDENTIALS``, or the metadata server on
    Cloud Run / GCE).
    """

    def __init__(
        self,
        project_id: str,
        credentials_path: str | None = None,
        collection: str = "sessions",
    ) -> None:
        self._project_id = project_id
        self._credentials_path = credentials_path
        self._collection_name = collection
        self._client: Any | None = None

    # --- client / plumbing ----------------------------------------------------
    def _get_client(self) -> Any:
        if self._client is None:
            try:
                from google.cloud import firestore
            except ImportError as exc:  # pragma: no cover - depends on optional SDK
                raise RuntimeError(
                    "google-cloud-firestore is not installed; install the "
                    "'firebase' extra (uv sync --extra firebase)."
                ) from exc
            if self._credentials_path:
                self._client = firestore.Client.from_service_account_json(
                    self._credentials_path, project=self._project_id
                )
            else:
                self._client = firestore.Client(project=self._project_id)
        return self._client

    def _doc(self, session_id: str) -> Any:
        return self._get_client().collection(self._collection_name).document(session_id)

    async def _exec(self, build: Any) -> Any:
        import asyncio

        return await asyncio.to_thread(build)

    async def _read(self, session_id: str) -> dict[str, Any] | None:
        snap = await self._exec(lambda: self._doc(session_id).get())
        if not getattr(snap, "exists", False):
            return None
        return snap.to_dict() or {}

    async def _update(self, session_id: str, values: dict[str, Any]) -> None:
        await self._exec(lambda: self._doc(session_id).update(values))

    # --- protocol -------------------------------------------------------------
    async def create_session(self, req: PrepRequest) -> str:
        session_id = _new_session_id()
        payload = {
            "id": session_id,
            "status": "prep",
            # Owner uid (Firebase Auth) so a hosted read can be scoped per user;
            # None on the offline/anonymous path.
            "user_id": req.user_id,
            "company": req.company,
            "cv_url": req.cv_url,
            "jd_text": req.jd_text,
            "language_mode": req.language_mode.model_dump(),
            "progress": [],
            "prep_warnings": [],
        }
        await self._exec(lambda: self._doc(session_id).set(payload))
        return session_id

    async def save_context(self, session_id: str, ctx: InterviewContext) -> None:
        await self._update(session_id, {"context": ctx.model_dump()})

    async def load_context(self, session_id: str) -> InterviewContext | None:
        data = await self._read(session_id)
        if not data or not data.get("context"):
            return None
        return InterviewContext.model_validate(data["context"])

    async def update_status(self, session_id: str, status: str) -> None:
        await self._update(session_id, {"status": status})

    async def append_answer(self, session_id: str, a: AnswerRecord) -> None:
        # Answers are appended INSIDE the context map, so this is a
        # read-modify-write and must run in a transaction: two turns finishing
        # close together would otherwise clobber each other and silently drop a
        # recorded answer.
        def _apply(snapshot_data: dict[str, Any]) -> dict[str, Any] | None:
            ctx_data = snapshot_data.get("context")
            if not ctx_data:
                return None
            ctx = InterviewContext.model_validate(ctx_data)
            ctx.answers.append(a)
            return {"context": ctx.model_dump()}

        await self._exec(lambda: self._read_modify_write(session_id, _apply))

    def _read_modify_write(
        self, session_id: str, apply: Any
    ) -> None:
        """Run ``apply(doc_data) -> updates | None`` inside a Firestore transaction.

        Separated from :meth:`append_answer` so tests can drive the logic with a
        fake client; the real transactional decorator lives here only.
        """
        from google.cloud import firestore

        client = self._get_client()
        ref = client.collection(self._collection_name).document(session_id)

        @firestore.transactional
        def _txn(transaction: Any) -> None:
            snap = ref.get(transaction=transaction)
            if not getattr(snap, "exists", False):
                return
            updates = apply(snap.to_dict() or {})
            if updates:
                transaction.update(ref, updates)

        _txn(client.transaction())

    async def save_scorecard(self, session_id: str, sc: ScoreCard) -> None:
        await self._update(session_id, {"scorecard": sc.model_dump()})

    async def save_transcript(self, session_id: str, turns: list[dict]) -> None:
        await self._update(session_id, {"transcript": list(turns)})

    async def save_coach_transcript(self, session_id: str, turns: list[dict]) -> None:
        await self._update(session_id, {"coach_transcript": list(turns)})

    async def mark_progress(self, session_id: str, step: str) -> None:
        data = await self._read(session_id)
        if data is None:
            return
        progress = list(data.get("progress") or [])
        if step not in progress:
            progress.append(step)
            await self._update(session_id, {"progress": progress})

    async def add_warnings(self, session_id: str, warnings: list[str]) -> None:
        data = await self._read(session_id)
        if data is None:
            return
        existing = list(data.get("prep_warnings") or [])
        changed = False
        for w in warnings:
            if w not in existing:
                existing.append(w)
                changed = True
        if changed:
            await self._update(session_id, {"prep_warnings": existing})

    async def get_session_view(self, session_id: str) -> SessionView | None:
        data = await self._read(session_id)
        if data is None:
            return None
        ctx_data = data.get("context")
        sc_data = data.get("scorecard")
        return SessionView(
            session_id=data.get("id", session_id),
            status=data.get("status", "prep"),
            progress=list(data.get("progress") or []),
            prep_warnings=list(data.get("prep_warnings") or []),
            context=InterviewContext.model_validate(ctx_data) if ctx_data else None,
            scorecard=ScoreCard.model_validate(sc_data) if sc_data else None,
        )


# Module-wide singleton so MemoryRepository state survives across build_deps() calls.
_MEMORY_REPO = MemoryRepository()


def get_repository(settings: Settings) -> SessionRepository:
    """Return the Firestore repository when configured, else the memory singleton."""
    if settings.firebase_project_id:
        return FirestoreRepository(
            settings.firebase_project_id,
            settings.firebase_credentials_path,
            settings.firestore_collection,
        )
    if settings.firebase_credentials_path:
        # Credentials without a project id can never build a client; that is
        # almost always a deployment mistake, so say so loudly instead of
        # silently dropping every session into process memory.
        log.error(
            "Firebase is PARTIALLY configured (FIREBASE_CREDENTIALS_PATH is set "
            "but FIREBASE_PROJECT_ID is missing); falling back to the in-memory "
            "store — sessions will NOT survive a restart."
        )
    return _MEMORY_REPO
