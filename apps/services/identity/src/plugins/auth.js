"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
async function requireAuth(request, reply) {
    try {
        // reads the authentication bearer <token> header and verifies signature
        await request.jwtVerify();
    }
    catch (error) {
        reply.status(401).send({ error: 'Unauthorized' });
    }
}
