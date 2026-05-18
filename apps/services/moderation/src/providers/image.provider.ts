export interface ModerationResult {
    score: number
    flagged: boolean
}

// pluggable : swap for NSF.js or Rekognition without touching the worker
export async function analyzeImage(url: string): Promise<ModerationResult> {
    return analyzeImagePlaceholder(url)
}

function analyzeImagePlaceholder(url: string): ModerationResult {
    console.log(`[Moderation] Image check skipped (placeholder): ${url}`)
    return { score: 0.0, flagged: false }
}


// --- NSFW.js implementation (uncomment when S3 image upload is wired) ---
// import * as nsfwjs from 'nsfwjs'
// import * as tf from '@tensorflow/tfjs-node'
// import axios from 'axios'
// import sharp from 'sharp'
//
// let model: nsfwjs.NSFWJS | null = null
//
// async function getModel() {
//   if (!model) model = await nsfwjs.load()
//   return model
// }
//
// async function analyzeWithNSFWJS(url: string): Promise<ModerationResult> {
//   const response = await axios.get(url, { responseType: 'arraybuffer' })
//   const imageBuffer = await sharp(response.data).toFormat('png').toBuffer()
//   const tfImage = tf.node.decodeImage(imageBuffer, 3) as tf.Tensor3D
//   const m = await getModel()
//   const predictions = await m.classify(tfImage)
//   tfImage.dispose()
//
//   const nsfwScore = predictions
//     .filter(p => ['Porn', 'Hentai', 'Sexy'].includes(p.className))
//     .reduce((sum, p) => sum + p.probability, 0)
//
//   return { score: nsfwScore, flagged: nsfwScore > 0.6 }
// }
