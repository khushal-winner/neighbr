"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getResend = getResend;
const resend_1 = require("resend");
let client = null;
function getResend() {
    if (!client) {
        const key = process.env.RESEND_API_KEY;
        if (!key)
            throw new Error('RESEND_API_KEY is not set');
        client = new resend_1.Resend(key);
    }
    return client;
}
