-- Phase 5: LINE Rich Menu & Flex Message (additive only, no existing data is modified)

CREATE TABLE IF NOT EXISTS "rich_menus" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "menu_type" TEXT NOT NULL,
  "line_rich_menu_id" TEXT,
  "chat_bar_text" TEXT NOT NULL DEFAULT 'เมนูจับจอง',
  "width" INTEGER NOT NULL DEFAULT 2500,
  "height" INTEGER NOT NULL DEFAULT 1686,
  "image_data" TEXT,
  "image_mime_type" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "published_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "rich_menus_line_rich_menu_id_key" ON "rich_menus"("line_rich_menu_id");
CREATE INDEX IF NOT EXISTS "rich_menus_menu_type_status_idx" ON "rich_menus"("menu_type", "status");

CREATE TABLE IF NOT EXISTS "rich_menu_actions" (
  "id" TEXT PRIMARY KEY,
  "rich_menu_id" TEXT NOT NULL REFERENCES "rich_menus"("id") ON DELETE CASCADE,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "label" TEXT NOT NULL,
  "area" JSONB NOT NULL,
  "action_type" TEXT NOT NULL,
  "action_data" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "rich_menu_actions_rich_menu_id_idx" ON "rich_menu_actions"("rich_menu_id");

CREATE TABLE IF NOT EXISTS "flex_message_templates" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "template_type" TEXT NOT NULL DEFAULT 'FLEX',
  "content" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "flex_message_templates_event_type_key" ON "flex_message_templates"("event_type");
CREATE INDEX IF NOT EXISTS "flex_message_templates_status_idx" ON "flex_message_templates"("status");

