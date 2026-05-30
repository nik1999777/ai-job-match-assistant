from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.ext.asyncio import AsyncAttrs, AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from api.settings import settings

engine = create_async_engine(settings.database_url, echo=False)


class Base(AsyncAttrs, DeclarativeBase):
    pass


class HiringDecision(str, PyEnum):
    hire = "hire"
    no_hire = "no_hire"
    borderline = "borderline"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="seeker")  # seeker | hr
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sessions: Mapped[list["Session"]] = relationship("Session", back_populates="user")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    mode: Mapped[str] = mapped_column(String(16))  # seeker | hr
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    user: Mapped["User | None"] = relationship("User", back_populates="sessions")
    analyses: Mapped[list["Analysis"]] = relationship("Analysis", back_populates="session")


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    resume_text: Mapped[str] = mapped_column(Text)
    resume_file_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    vacancy_text: Mapped[str] = mapped_column(Text)
    vacancy_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    match_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    seniority: Mapped[str | None] = mapped_column(String(32), nullable=True)
    seniority_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    skills_found: Mapped[str | None] = mapped_column(Text, nullable=True)
    skills_missing: Mapped[str | None] = mapped_column(Text, nullable=True)

    llm_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    similar_vacancies: Mapped[str | None] = mapped_column(Text, nullable=True)
    decision: Mapped[HiringDecision | None] = mapped_column(
        SAEnum(HiringDecision), nullable=True
    )

    session: Mapped["Session"] = relationship("Session", back_populates="analyses")


class BatchSession(Base):
    __tablename__ = "batch_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    vacancy_text: Mapped[str] = mapped_column(Text)
    candidate_count: Mapped[int] = mapped_column(Integer)
    results: Mapped[str] = mapped_column(Text)  # JSON array of CandidateResult
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User | None"] = relationship("User")


class SeekSession(Base):
    __tablename__ = "seek_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    job_title: Mapped[str] = mapped_column(String(255))
    result_count: Mapped[int] = mapped_column(Integer)
    results: Mapped[str] = mapped_column(Text)  # JSON array of VacancyResult
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User | None"] = relationship("User")


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncSession:
    async with AsyncSession(engine) as session:
        yield session
