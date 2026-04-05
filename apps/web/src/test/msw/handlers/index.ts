import { createAuthHandlers } from "./auth";
import { createChatHandlers } from "./chat";
import { createKnowledgeHandlers } from "./knowledge";
import { createSettingsHandlers } from "./settings";
import { createUsersHandlers } from "./users";

export const handlers = [
  ...createAuthHandlers(),
  ...createChatHandlers(),
  ...createKnowledgeHandlers(),
  ...createSettingsHandlers(),
  ...createUsersHandlers(),
];
