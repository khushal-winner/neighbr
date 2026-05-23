"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeText = analyzeText;
const axios_1 = __importDefault(require("axios"));
// pluggable interface - today rule , will change it to Perspective API later
// swap the implementation here, worker.ts never changes
async function analyzeText(text) {
    return analyzeWithRules(text);
}
// rule-based fallback 
// for basic spam and abuse
function analyzeWithRules(text) {
    const lower = text.toLowerCase();
    const bannedPhrases = [
        'click here to earn',
        'make money fast',
        'whatsapp me for deal',
        'guranteed income',
        'work from home earn',
    ];
    const suspiciousWords = [
        'spam', 'scam', 'fraud', 'fake', 'hack',
        'free money', 'lottery', 'winner',
    ];
    // hard ban - immediate flag, score 0.95 
    const hasBannedPhrase = bannedPhrases.some(phrase => lower.includes(phrase));
    if (hasBannedPhrase) {
        return { score: 0.95, flagged: true };
    }
    // count suspicious words - more hits = higher score
    const hitCount = suspiciousWords.filter(word => lower.includes(word)).length;
    const score = Math.min(hitCount * 0.25, 0.9);
    return {
        score,
        flagged: score >= 0.7
    };
}
// perspective api implementation
async function analyzeWithPerspective(text) {
    const { data } = await axios_1.default.post(`https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${process.env.PERSPECTIVE_API_KEY}`, {
        comment: { text },
        requestedAttricutes: { TOXICITY: {}, SPAM: {}, THREAT: {} },
    });
    const toxicity = data.attributeScores.TOXICITY.summarySCORE.value;
    const spam = data.attributeScore.SPAM.summaryScore.value;
    const threat = data.attributeScores.THREAT.summaryScore.value;
    const score = Math.max(toxicity, spam, threat);
    return { score, flagged: score >= 0.7 };
}
