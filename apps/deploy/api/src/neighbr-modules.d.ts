declare module "@neighbr/identity/register" {
  import type { FastifyInstance } from "fastify";
  export function registerIdentityRoutes(app: FastifyInstance): Promise<void>;
}

declare module "@neighbr/post/register" {
  import type { FastifyInstance } from "fastify";
  export function registerPostRoutes(app: FastifyInstance): Promise<void>;
}

declare module "@neighbr/feed/register" {
  import type { FastifyInstance } from "fastify";
  export function registerFeedRoutes(app: FastifyInstance): Promise<void>;
}

declare module "@neighbr/chat/register" {
  import type { FastifyInstance } from "fastify";
  export function registerChatRoutes(app: FastifyInstance): Promise<void>;
}

declare module "@neighbr/community/register" {
  import type { FastifyInstance } from "fastify";
  export function registerCommunityRoutes(app: FastifyInstance): Promise<void>;
}

declare module "@neighbr/webhook/register" {
  import type { FastifyInstance } from "fastify";
  export function registerWebhookRoutes(app: FastifyInstance): Promise<void>;
}

declare module "@neighbr/moderation/register" {
  import type { FastifyInstance } from "fastify";
  export function registerModerationRoutes(app: FastifyInstance): Promise<void>;
}
