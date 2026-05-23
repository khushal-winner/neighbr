declare module "firebase-admin" {
  import * as admin from "firebase-admin";

  export namespace credential {
    function cert(serviceAccount: object | string): admin.Credential;
  }

  export namespace app {
    interface App {
      name: string;
      options: object;
    }
  }

  export namespace messaging {
    interface SendResponse {
      success: boolean;
      error?: { message: string };
    }

    interface MulticastResponse {
      successCount: number;
      failureCount: number;
      responses: SendResponse[];
    }

    interface MulticastMessage {
      tokens: string[];
      notification: { title: string; body: string };
      data?: Record<string, string>;
      android?: { priority: string; notification: { sound: string } };
      apns?: { payload: { aps: { sound: string; badge: number } } };
    }

    interface Messaging {
      sendEachForMulticast(
        message: MulticastMessage,
      ): Promise<MulticastResponse>;
    }
  }

  export function initializeApp(options?: admin.AppOptions): admin.app.App;
  export function app(name?: string): admin.app.App;
  export function messaging(): messaging.Messaging;
}
