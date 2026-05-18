import axios from "axios"


export interface ModerationResult {
    score: number // 0.0 to 1.0 - higher means more likely harmful
    flagged: boolean
}

// pluggable interface - today rule , will change it to Perspective API later
// swap the implementation here, worker.ts never changes

export async function analyzeText(text: string): Promise<ModerationResult> {
    return analyzeWithRules(text)
}

// rule-based fallback 
// for basic spam and abuse
function analyzeWithRules(text: string): ModerationResult {
    const lower = text.toLowerCase()

    const bannedPhrases = [
        'click here to earn',
        'make money fast',
        'whatsapp me for deal',
        'guranteed income',
        'work from home earn',
    ]

    const suspiciousWords = [
        'spam', 'scam', 'fraud', 'fake', 'hack',
        'free money', 'lottery', 'winner',
    ]

    // hard ban - immediate flag, score 0.95 
    const hasBannedPhrase = bannedPhrases.some(phrase => lower.includes(phrase))
    if (hasBannedPhrase) {
        return { score: 0.95, flagged: true }
    }

    // count suspicious words - more hits = higher score
    const hitCount = suspiciousWords.filter(word => lower.includes(word)).length
    const score = Math.min(hitCount * 0.25, 0.9)


    return {
        score,
        flagged: score >= 0.7
    }

}

// perspective api implementation
async function analyzeWithPerspective(text: string): Promise<ModerationResult> {
    const { data } = await axios.post(
        `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${process.env.PERSPECTIVE_API_KEY}`,
        {
            comment: { text },
            requestedAttricutes: { TOXICITY: {}, SPAM: {}, THREAT: {} },
        }
    )

    const toxicity = data.attributeScores.TOXICITY.summarySCORE.value
    const spam = data.attributeScore.SPAM.summaryScore.value
    const threat = data.attributeScores.THREAT.summaryScore.value

    const score = Math.max(toxicity, spam, threat)
    return { score, flagged: score >= 0.7 }
}