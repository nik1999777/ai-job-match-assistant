"""add similar_vacancies to analysis

Revision ID: e4f5a6b7c8d9
Revises: d30c80467fd3
Create Date: 2026-05-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e4f5a6b7c8d9'
down_revision: Union[str, Sequence[str], None] = '40fa45ae75c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('analyses', sa.Column('similar_vacancies', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('analyses', 'similar_vacancies')
