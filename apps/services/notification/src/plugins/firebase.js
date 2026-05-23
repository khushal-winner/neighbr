"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFirebase = getFirebase;
exports.sendMulticast = sendMulticast;
const admin = __importStar(require("firebase-admin"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let initialized = false;
function getFirebase() {
    if (!initialized) {
        const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
        if (!serviceAccountPath) {
            throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH not set");
        }
        const resolved = path.resolve(serviceAccountPath);
        const serviceAccount = JSON.parse(fs.readFileSync(resolved, "utf8"));
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        initialized = true;
        console.log("[Firebase] initialized");
    }
    return admin.app();
}
// send to multiple FCM tokens in one batch call
// firebase handles up to 500 tokens per batch
async function sendMulticast(tokens, title, body, data) {
    if (tokens.length === 0)
        return;
    getFirebase();
    const message = {
        tokens,
        notification: {
            title,
            body,
        },
        data: data ?? {},
        android: {
            priority: "high",
            notification: { sound: "default" },
        },
        apns: {
            payload: {
                aps: { sound: "default", badge: 1 },
            },
        },
    };
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`[Firebase] Sent : ${response.successCount} success, ${response.failureCount} failure`);
    // log failed token - in production you'd remove stale from DB
    response.responses.forEach((res, i) => {
        if (!res.success) {
            console.warn(`[Firebase] token ${tokens[i]} failed: ${res.error?.message}`);
        }
    });
}
