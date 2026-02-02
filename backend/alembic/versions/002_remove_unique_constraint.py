"""remove unique constraint from auctions

Revision ID: 002
Revises: 001
Create Date: 2024-01-02 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade():
    # Drop the unique constraint on auctions.player_id
    op.drop_constraint('auctions_player_id_key', 'auctions', type_='unique')


def downgrade():
    # Recreate the unique constraint
    op.create_unique_constraint('auctions_player_id_key', 'auctions', ['player_id'])