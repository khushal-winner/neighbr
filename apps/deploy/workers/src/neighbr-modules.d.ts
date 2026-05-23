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
