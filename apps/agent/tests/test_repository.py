"""Offline tests for the session repositories.

``MemoryRepository`` is exercised directly. ``FirestoreRepository`` — the
PRODUCTION persistence of the live-result write-back, scorecard save, status
transitions, and the session-view read — is exercised through an injected fake
recording client: ``_get_client()`` only imports the optional
``google-cloud-firestore`` SDK when ``self._client is None``, so setting
``repo._client`` to a Firestore-shaped fake runs every real repository method
offline (conftest blanks the creds, so nothing else in the suite ever
constructs this class). The fake JSON-encodes every write payload, pinning that
python-mode ``model_dump()`` payloads stay serializable on the hosted path too
(Firestore rejects arbitrary python objects just as postgrest does).

``append_answer`` runs its read-modify-write inside a real Firestore
transaction, whose decorator lives in the SDK; the fake repo subclass below
substitutes an equivalent non-atomic read/apply/write so the *payload* logic is
covered offline. Atomicity itself is the SDK's contract, not ours.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from deepinterview_agent.core.adapters.mock import build_mock
from deepinterview_agent.core.persistence.repository import (
    FirestoreRepository,
    MemoryRepository,
)
from deepinterview_agent.shared_models import (
    AnswerRecord,
    InterviewContext,
    LanguageMode,
    PrepRequest,
    ScoreCard,
)


def _run(coro):
    return asyncio.run(coro)


def _prep_request() -> PrepRequest:
    return PrepRequest(
        cv_url="https://example.com/cv.pdf",
        jd_text="We are hiring a backend engineer.",
        company="Acme Payments",
        language_mode=LanguageMode(primary="en", mixed=False),
    )


def test_create_save_load_round_trip() -> None:
    repo = MemoryRepository()
    session_id = _run(repo.create_session(_prep_request()))
    assert session_id.startswith("sess_")
    assert repo.get_status(session_id) == "prep"

    ctx = build_mock(InterviewContext)
    assert isinstance(ctx, InterviewContext)
    _run(repo.save_context(session_id, ctx))

    loaded = _run(repo.load_context(session_id))
    assert loaded is not None
    assert loaded.model_dump() == ctx.model_dump()


def test_create_session_stamps_user_id() -> None:
    """Regression (report RLS bug, PR #5): the owning user must land on the row.

    Dropping the ``user_id=req.user_id`` stamp would silently pass the rest of
    the suite while breaking the hosted layer's per-user ownership read
    (``user_id`` matched against the caller's Firebase Auth uid).
    """
    repo = MemoryRepository()
    owner = "11111111-2222-3333-4444-555555555555"
    req = _prep_request().model_copy(update={"user_id": owner})
    session_id = _run(repo.create_session(req))
    assert repo._rows[session_id].user_id == owner

    # The offline/no-auth path stays ownerless (None), never an empty string.
    anon_id = _run(repo.create_session(_prep_request()))
    assert repo._rows[anon_id].user_id is None


def test_save_coach_transcript_does_not_touch_interview_transcript() -> None:
    """The spoken coach's log persists separately from the interview record."""
    repo = MemoryRepository()
    session_id = _run(repo.create_session(_prep_request()))
    interview = [{"role": "user", "text": "my interview answer"}]
    coach = [{"role": "assistant", "text": "let's drill system design"}]
    _run(repo.save_transcript(session_id, interview))
    _run(repo.save_coach_transcript(session_id, coach))
    row = repo._rows[session_id]
    assert row.transcript == interview
    assert row.coach_transcript == coach


def test_update_status_and_missing_load() -> None:
    repo = MemoryRepository()
    session_id = _run(repo.create_session(_prep_request()))
    _run(repo.update_status(session_id, "ready"))
    assert repo.get_status(session_id) == "ready"
    # A session with no saved context returns None.
    assert _run(repo.load_context("sess_does_not_exist")) is None


def test_append_answer_and_save_scorecard() -> None:
    repo = MemoryRepository()
    session_id = _run(repo.create_session(_prep_request()))

    answer = AnswerRecord(
        question_id="q1",
        transcript="A mock answer.",
        started_at="2026-06-08T09:00:00Z",
        ended_at="2026-06-08T09:01:00Z",
    )
    _run(repo.append_answer(session_id, answer))

    scorecard = build_mock(ScoreCard)
    assert isinstance(scorecard, ScoreCard)
    _run(repo.save_scorecard(session_id, scorecard))

    _run(repo.save_transcript(session_id, [{"role": "agent", "text": "hi"}]))




# --- FirestoreRepository via an injected fake recording client -----------------


class _FakeSnapshot:
    def __init__(self, data: dict | None) -> None:
        self._data = data
        self.exists = data is not None

    def to_dict(self) -> dict | None:
        return dict(self._data) if self._data is not None else None


class _FakeDocument:
    """One Firestore document reference over a shared in-memory store.

    Records ``(op, payload, doc_id)`` on the shared log and JSON-encodes every
    write where the real client serializes, so a non-serializable type added to
    a model breaks these tests instead of only the hosted deployment.
    """

    def __init__(self, doc_id: str, store: dict[str, dict], log: list[tuple]) -> None:
        self._id = doc_id
        self._store = store
        self._log = log

    def set(self, payload: dict) -> None:
        json.dumps(payload)
        self._log.append(("set", payload, self._id))
        self._store[self._id] = dict(payload)

    def update(self, values: dict) -> None:
        json.dumps(values)
        self._log.append(("update", values, self._id))
        row = self._store.get(self._id)
        if row is None:
            # Mirrors the real client, which raises NotFound on a missing doc.
            raise KeyError(self._id)
        row.update(values)

    def get(self, transaction: Any = None) -> _FakeSnapshot:
        self._log.append(("get", None, self._id))
        return _FakeSnapshot(self._store.get(self._id))


class _FakeCollection:
    def __init__(self, store: dict[str, dict], log: list[tuple]) -> None:
        self._store = store
        self._log = log

    def document(self, doc_id: str) -> _FakeDocument:
        return _FakeDocument(doc_id, self._store, self._log)


class _FakeFirestoreClient:
    def __init__(self) -> None:
        self.rows: dict[str, dict] = {}
        self.log: list[tuple] = []

    def collection(self, name: str) -> _FakeCollection:
        assert name == "sessions", "all session persistence lives in one collection"
        return _FakeCollection(self.rows, self.log)


class _FakeTxnRepository(FirestoreRepository):
    """Repository whose transaction helper runs against the fake, not the SDK."""

    def _read_modify_write(self, session_id: str, apply: Any) -> None:
        doc = self._get_client().collection(self._collection_name).document(session_id)
        snap = doc.get()
        if not snap.exists:
            return
        updates = apply(snap.to_dict() or {})
        if updates:
            doc.update(updates)


def _firestore_repo() -> tuple[FirestoreRepository, _FakeFirestoreClient]:
    repo = _FakeTxnRepository("deepinterview-test")
    fake = _FakeFirestoreClient()
    repo._client = fake  # _get_client() only imports the SDK when _client is None
    return repo, fake


def test_firestore_create_and_context_round_trip_payloads_are_serializable() -> None:
    """create_session/save_context write python-mode ``model_dump()`` payloads:
    they must stay serializable AND round-trip through ``load_context`` — the
    exact read the scoring pipeline performs on the hosted path."""
    repo, fake = _firestore_repo()
    session_id = _run(repo.create_session(_prep_request()))
    assert session_id.startswith("sess_")
    assert fake.rows[session_id]["status"] == "prep"
    assert fake.rows[session_id]["jd_text"] == "We are hiring a backend engineer."

    ctx = build_mock(InterviewContext)
    assert isinstance(ctx, InterviewContext)
    _run(repo.save_context(session_id, ctx))  # raises in set/update if non-JSON

    loaded = _run(repo.load_context(session_id))
    assert loaded is not None
    assert loaded.model_dump() == ctx.model_dump()
    # Unknown ids read as None, never raise (the worker treats this as "not ready").
    assert _run(repo.load_context("sess_missing")) is None


def test_firestore_create_session_stamps_user_id_field() -> None:
    """The ownership field must land on the created document so a hosted,
    per-user read can scope sessions to their Firebase Auth uid."""
    repo, fake = _firestore_repo()
    owner = "firebase-uid-abc123"
    sid = _run(repo.create_session(_prep_request().model_copy(update={"user_id": owner})))
    assert fake.rows[sid]["user_id"] == owner
    anon = _run(repo.create_session(_prep_request()))
    assert fake.rows[anon]["user_id"] is None


def test_firestore_update_status_writes_each_live_terminal_status() -> None:
    """The live path's status transitions (no_answers / error / complete) must
    each become a ``{"status": ...}`` update against the document."""
    repo, fake = _firestore_repo()
    sid = _run(repo.create_session(_prep_request()))
    for status in ("no_answers", "error", "complete"):
        _run(repo.update_status(sid, status))
        assert fake.rows[sid]["status"] == status
        assert ("update", {"status": status}, sid) in fake.log


def test_firestore_save_scorecard_payload_is_serializable() -> None:
    """save_scorecard ships ``sc.model_dump()`` (python mode): it must encode and
    land in the ``scorecard`` field unchanged."""
    repo, fake = _firestore_repo()
    sid = _run(repo.create_session(_prep_request()))
    sc = build_mock(ScoreCard)
    assert isinstance(sc, ScoreCard)
    _run(repo.save_scorecard(sid, sc))  # raises in update() if non-JSON
    assert fake.rows[sid]["scorecard"] == sc.model_dump()


def test_firestore_append_answer_read_modify_writes_the_context_map() -> None:
    """``append_answer`` mutates the canonical context map: the appended answer
    must be visible to a later ``load_context``. With no context saved yet it is
    a silent no-op (no update issued), and an unknown session never raises."""
    repo, fake = _firestore_repo()
    sid = _run(repo.create_session(_prep_request()))
    ctx = build_mock(InterviewContext)
    assert isinstance(ctx, InterviewContext)
    base_answers = len(ctx.answers)
    _run(repo.save_context(sid, ctx))

    answer = AnswerRecord(
        question_id="q1",
        transcript="A real spoken answer.",
        started_at="2026-06-11T09:00:00Z",
        ended_at="2026-06-11T09:01:00Z",
    )
    _run(repo.append_answer(sid, answer))

    loaded = _run(repo.load_context(sid))
    assert loaded is not None
    assert len(loaded.answers) == base_answers + 1
    assert loaded.answers[-1].model_dump() == answer.model_dump()

    # No context yet -> append must not write anything.
    sid2 = _run(repo.create_session(_prep_request()))
    updates_before = len([op for op, *_ in fake.log if op == "update"])
    _run(repo.append_answer(sid2, answer))
    assert len([op for op, *_ in fake.log if op == "update"]) == updates_before

    # Unknown document -> no write, no raise.
    _run(repo.append_answer("sess_missing", answer))


def test_firestore_get_session_view_maps_the_document() -> None:
    """``get_session_view`` must map the stored document onto SessionView
    (status/progress/prep_warnings/context/scorecard), with idempotent
    progress/warning appends and a None for unknown ids (the API 404s on it)."""
    repo, _fake = _firestore_repo()
    sid = _run(repo.create_session(_prep_request()))
    ctx = build_mock(InterviewContext)
    sc = build_mock(ScoreCard)
    _run(repo.save_context(sid, ctx))
    _run(repo.save_scorecard(sid, sc))
    _run(repo.mark_progress(sid, "cv_analysis"))
    _run(repo.mark_progress(sid, "cv_analysis"))  # idempotent: no duplicate
    _run(repo.add_warnings(sid, ["JD text is very short."]))
    _run(repo.add_warnings(sid, ["JD text is very short."]))  # idempotent
    _run(repo.update_status(sid, "complete"))

    view = _run(repo.get_session_view(sid))
    assert view is not None
    assert (view.session_id, view.status) == (sid, "complete")
    assert view.progress == ["cv_analysis"]
    assert view.prep_warnings == ["JD text is very short."]
    assert view.context is not None
    assert view.context.model_dump() == ctx.model_dump()
    assert view.scorecard is not None
    assert view.scorecard.model_dump() == sc.model_dump()

    # Unknown ids map to None (the API turns this into a 404, not a 500), and
    # the progress/warning appends stay silent no-ops rather than raising.
    assert _run(repo.get_session_view("sess_missing")) is None
    _run(repo.mark_progress("sess_missing", "cv_analysis"))
    _run(repo.add_warnings("sess_missing", ["nope"]))


def test_get_repository_selects_firestore_only_when_project_id_is_set() -> None:
    """``FIREBASE_PROJECT_ID`` is the switch. Credentials alone must NOT select
    Firestore (it could not build a client) — that half-configured case falls
    back to memory and is logged as a deployment mistake."""
    from deepinterview_agent.core.config import Settings
    from deepinterview_agent.core.persistence.repository import get_repository

    firestore_repo = get_repository(Settings(firebase_project_id="proj-1"))
    assert isinstance(firestore_repo, FirestoreRepository)

    assert isinstance(get_repository(Settings()), MemoryRepository)
    half = get_repository(Settings(firebase_credentials_path="/tmp/key.json"))
    assert isinstance(half, MemoryRepository)
