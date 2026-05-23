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
declare module "@neighbr/feed/consumers/feed" {
  export function startFeedConsumer(): Promise<void>;
}
declare module "@neighbr/alert/consumers/alert" {
  export function startAlertConsumer(): Promise<void>;
}
declare module "@neighbr/trust/consumers/trust" {
  export function startTrustConsumer(): Promise<void>;
}
declare module "@neighbr/notification/consumers/notification" {
  export function startNotificationConsumer(): Promise<void>;
}
declare module "@neighbr/moderation/workers/moderation" {
  export function startModerationWorker(): Promise<void>;
}
declare module "@neighbr/digest/start" {
  export function startDigest(): Promise<void>;
}
