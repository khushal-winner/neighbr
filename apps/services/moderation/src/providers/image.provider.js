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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeImage = analyzeImage;
const nsfwjs = __importStar(require("nsfwjs"));
const tf = __importStar(require("@tensorflow/tfjs"));
const axios_1 = __importDefault(require("axios"));
const sharp_1 = __importDefault(require("sharp"));
let model = null;
async function getModel() {
    if (!model)
        model = await nsfwjs.load();
    return model;
}
async function analyzeImage(url) {
    try {
        const response = await axios_1.default.get(url, { responseType: 'arraybuffer' });
        const { data, info } = await (0, sharp_1.default)(response.data)
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        const tfImage = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], 'int32');
        const m = await getModel();
        const predictions = await m.classify(tfImage);
        tfImage.dispose();
        const nsfwScore = predictions
            .filter((p) => ['Porn', 'Hentai', 'Sexy'].includes(p.className))
            .reduce((sum, p) => sum + p.probability, 0);
        console.log(`[Moderation] Image ${url} score: ${nsfwScore.toFixed(2)}`);
        return { score: nsfwScore, flagged: nsfwScore > 0.6 };
    }
    catch (err) {
        console.error(`[Moderation] Failed to analyze image ${url}:`, err);
        // Fail closed or open? Let's assume fail open (0.0) but log it so the post isn't stuck
        return { score: 0.0, flagged: false };
    }
}
