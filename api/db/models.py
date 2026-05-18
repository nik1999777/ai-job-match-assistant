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


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    mode: Mapped[str] = mapped_column(String(16))  # seeker | hr

    analyses: Mapped[list["Analysis"]] = relationship("Analysis", back_populates="session")


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    resume_text: Mapped[str] = mapped_column(Text)
    vacancy_text: Mapped[str] = mapped_column(Text)

    match_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    seniority: Mapped[str | None] = mapped_column(String(32), nullable=True)
    seniority_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    skills_found: Mapped[str | None] = mapped_column(Text, nullable=True)   # JSON list
    skills_missing: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list

    llm_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    decision: Mapped[HiringDecision | None] = mapped_column(
        SAEnum(HiringDecision), nullable=True
    )

    session: Mapped["Session"] = relationship("Session", back_populates="analyses")


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncSession:
    async with AsyncSession(engine) as session:
        yield session
