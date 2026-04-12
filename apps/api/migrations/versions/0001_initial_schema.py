from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("theme_preference", sa.String(length=16), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("role IN ('admin', 'user')", name="ck_users_role"),
        sa.CheckConstraint("status IN ('active', 'disabled')", name="ck_users_status"),
        sa.CheckConstraint(
            "theme_preference IN ('light', 'dark', 'system')", name="ck_users_theme_preference"
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("session_token_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("session_token_hash", name="uq_auth_sessions_session_token_hash"),
    )

    op.create_table(
        "spaces",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="personal"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("kind IN ('personal')", name="ck_spaces_kind"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("slug", name="uq_spaces_slug"),
    )

    op.create_table(
        "documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("space_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("logical_name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("current_version_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("latest_revision_id", sa.Integer(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("status IN ('active', 'archived')", name="ck_documents_status"),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "uq_documents_space_logical_name", "documents", ["space_id", "logical_name"], unique=True
    )
    op.create_index(
        "ix_documents_space_updated", "documents", ["space_id", "updated_at", "id"], unique=False
    )

    op.create_table(
        "document_revisions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("revision_no", sa.Integer(), nullable=False),
        sa.Column("source_filename", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=False),
        sa.Column("content_hash", sa.String(length=128), nullable=False),
        sa.Column("file_type", sa.String(length=32), nullable=False),
        sa.Column("ingest_status", sa.String(length=16), nullable=False),
        sa.Column("source_path", sa.String(length=512), nullable=False),
        sa.Column("normalized_path", sa.String(length=512), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("chunk_count", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("supersedes_revision_id", sa.Integer(), nullable=True),
        sa.Column("indexed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "ingest_status IN ('uploaded', 'processing', 'indexed', 'failed')",
            name="ck_document_revisions_ingest_status",
        ),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["supersedes_revision_id"], ["document_revisions.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "uq_document_revisions_document_revision_no",
        "document_revisions",
        ["document_id", "revision_no"],
        unique=True,
    )
    op.create_index(
        "ix_document_revisions_document_revision_no",
        "document_revisions",
        ["document_id", "revision_no"],
        unique=False,
    )
    op.execute(
        """
        CREATE VIRTUAL TABLE retrieval_chunks_fts USING fts5(
            generation UNINDEXED,
            chunk_id UNINDEXED,
            document_revision_id UNINDEXED,
            document_id UNINDEXED,
            space_id UNINDEXED,
            page_number UNINDEXED,
            section_title,
            content,
            tokenize='unicode61'
        )
        """
    )

    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("space_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("reasoning_mode", sa.String(length=16), nullable=False, server_default="default"),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("status IN ('active', 'archived')", name="ck_chat_sessions_status"),
        sa.CheckConstraint(
            "reasoning_mode IN ('default', 'off', 'on')", name="ck_chat_sessions_reasoning_mode"
        ),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_chat_sessions_user_updated",
        "chat_sessions",
        ["user_id", "updated_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_chat_sessions_space_updated",
        "chat_sessions",
        ["space_id", "updated_at", "id"],
        unique=False,
    )

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("client_request_id", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("retry_of_message_id", sa.Integer(), nullable=True),
        sa.Column("reply_to_message_id", sa.Integer(), nullable=True),
        sa.Column("sources_json", sa.JSON(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["session_id"], ["chat_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["retry_of_message_id"], ["chat_messages.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reply_to_message_id"], ["chat_messages.id"], ondelete="SET NULL"),
        sa.CheckConstraint("role IN ('user', 'assistant', 'system')", name="ck_chat_messages_role"),
        sa.CheckConstraint(
            "status IN ('pending', 'streaming', 'succeeded', 'failed', 'cancelled')",
            name="ck_chat_messages_status",
        ),
        sa.CheckConstraint(
            "((role = 'user' AND client_request_id IS NOT NULL) "
            "OR (role IN ('assistant', 'system') AND client_request_id IS NULL))",
            name="ck_chat_messages_client_request_id",
        ),
    )
    op.create_index(
        "uq_chat_messages_user_request",
        "chat_messages",
        ["session_id", "client_request_id"],
        unique=True,
        sqlite_where=sa.text("role = 'user' AND client_request_id IS NOT NULL"),
    )
    op.create_index(
        "ix_chat_messages_session_created", "chat_messages", ["session_id", "id"], unique=False
    )
    op.create_index(
        "ix_chat_messages_reply_to_message_id",
        "chat_messages",
        ["reply_to_message_id"],
        unique=False,
    )

    op.create_table(
        "chat_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("parent_run_id", sa.Integer(), nullable=True),
        sa.Column("user_message_id", sa.Integer(), nullable=True),
        sa.Column("assistant_message_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("response_provider", sa.String(length=32), nullable=False),
        sa.Column("response_model", sa.String(length=255), nullable=False),
        sa.Column("reasoning_mode", sa.String(length=16), nullable=False, server_default="default"),
        sa.Column("client_request_id", sa.String(length=64), nullable=False),
        sa.Column("usage_json", sa.JSON(), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["session_id"], ["chat_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_run_id"], ["chat_runs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_message_id"], ["chat_messages.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["assistant_message_id"], ["chat_messages.id"], ondelete="SET NULL"
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')",
            name="ck_chat_runs_status",
        ),
        sa.CheckConstraint(
            "reasoning_mode IN ('default', 'off', 'on')",
            name="ck_chat_runs_reasoning_mode",
        ),
    )
    op.create_index(
        "ix_chat_runs_session_status_created",
        "chat_runs",
        ["session_id", "status", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_chat_runs_client_request_id", "chat_runs", ["client_request_id"], unique=False
    )

    op.create_table(
        "chat_run_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["run_id"], ["chat_runs.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("run_id", "seq", name="uq_chat_run_events_run_seq"),
    )
    op.create_index(
        "ix_chat_run_events_run_seq", "chat_run_events", ["run_id", "seq"], unique=False
    )
    op.create_index("ix_chat_run_events_type", "chat_run_events", ["event_type"], unique=False)

    op.create_table(
        "chat_message_attachments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("message_id", sa.Integer(), nullable=False),
        sa.Column("attachment_id", sa.String(length=64), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("document_revision_id", sa.Integer(), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["message_id"], ["chat_messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["document_revision_id"], ["document_revisions.id"], ondelete="SET NULL"
        ),
        sa.UniqueConstraint(
            "message_id", "attachment_id", name="uq_chat_message_attachments_message_attachment_id"
        ),
        sa.CheckConstraint(
            "type IN ('image', 'document')", name="ck_chat_message_attachments_type"
        ),
    )
    op.create_index(
        "ix_chat_message_attachments_message_id",
        "chat_message_attachments",
        ["message_id"],
        unique=False,
    )
    op.create_index(
        "ix_chat_message_attachments_document_revision_id",
        "chat_message_attachments",
        ["document_revision_id"],
        unique=False,
    )

    op.create_table(
        "app_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("scope_type", sa.String(length=16), nullable=False, server_default="global"),
        sa.Column("scope_id", sa.String(length=64), nullable=False, server_default="global"),
        sa.Column("provider_profiles_json", sa.JSON(), nullable=False),
        sa.Column("response_route_json", sa.JSON(), nullable=False),
        sa.Column("embedding_route_json", sa.JSON(), nullable=False),
        sa.Column("pending_embedding_route_json", sa.JSON(), nullable=True),
        sa.Column("vision_route_json", sa.JSON(), nullable=False),
        sa.Column("system_prompt", sa.Text(), nullable=True),
        sa.Column("provider_timeout_seconds", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.Column("active_index_generation", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("building_index_generation", sa.Integer(), nullable=True),
        sa.Column(
            "index_rebuild_status", sa.String(length=16), nullable=False, server_default="idle"
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.CheckConstraint(
            "scope_type IN ('global', 'workspace')",
            name="ck_app_settings_scope_type",
        ),
        sa.CheckConstraint(
            "index_rebuild_status IN ('idle', 'running', 'failed')",
            name="ck_app_settings_index_rebuild_status",
        ),
        sa.CheckConstraint(
            "provider_timeout_seconds > 0", name="ck_app_settings_provider_timeout_seconds"
        ),
    )
    op.create_index(
        "uq_app_settings_scope",
        "app_settings",
        ["scope_type", "scope_id"],
        unique=True,
    )

    op.create_table(
        "settings_versions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("settings_id", sa.Integer(), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("snapshot_json", sa.JSON(), nullable=False),
        sa.Column("changed_fields_json", sa.JSON(), nullable=True),
        sa.Column("trigger", sa.String(length=16), nullable=False),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "trigger IN ('bootstrap', 'update')",
            name="ck_settings_versions_trigger",
        ),
        sa.ForeignKeyConstraint(["settings_id"], ["app_settings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "uq_settings_versions_settings_version",
        "settings_versions",
        ["settings_id", "version_no"],
        unique=True,
    )
    op.create_index(
        "ix_settings_versions_settings_created",
        "settings_versions",
        ["settings_id", "created_at", "id"],
        unique=False,
    )

    op.create_table(
        "rate_limit_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column(
            "attempted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_rate_limit_attempts_key_attempted_at",
        "rate_limit_attempts",
        ["key", "attempted_at"],
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS retrieval_chunks_fts")
    op.drop_index("ix_rate_limit_attempts_key_attempted_at")
    for table_name in (
        "rate_limit_attempts",
        "settings_versions",
        "app_settings",
        "chat_message_attachments",
        "chat_run_events",
        "chat_runs",
        "chat_messages",
        "chat_sessions",
        "document_revisions",
        "documents",
        "spaces",
        "auth_sessions",
        "users",
    ):
        op.drop_table(table_name)
