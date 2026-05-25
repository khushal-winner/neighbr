// Image moderation (NSFWJS + TensorFlow.js) disabled on free tier — exceeds 512MB heap limit.
// Text-only moderation is handled in moderation.worker.ts via analyzeText().
// To re-enable, install @tensorflow/tfjs and nsfwjs dependencies and uncomment below.
//
// import * as nsfwjs from 'nsfwjs'
// import * as tf from '@tensorflow/tfjs'
// import axios from 'axios'
// import sharp from 'sharp'
//
// export interface ModerationResult {
//   score: number
//   flagged: boolean
// }
//
// let model: nsfwjs.NSFWJS | null = null
// let modelLoadingPromise: Promise<nsfwjs.NSFWJS> | null = null
//
// async function getModel() {
//   if (model) return model
//   if (modelLoadingPromise) return modelLoadingPromise
//
//   modelLoadingPromise = nsfwjs.load().then(loadedModel => {
//     model = loadedModel
//     modelLoadingPromise = null
//     console.log('[Moderation] NSFWJS model loaded successfully')
//     return model
//   })
//
//   return modelLoadingPromise
// }
//
// export async function preloadModel(): Promise<void> {
//   try {
//     await getModel()
//   } catch (err) {
//     console.warn('[Moderation] Failed to preload NSFWJS model:', err)
//   }
// }
//
// export async function analyzeImage(url: string): Promise<ModerationResult> {
//   let tfImage: tf.Tensor | null = null
//   try {
//     const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 })
//     const { data, info } = await sharp(response.data)
//       .removeAlpha()
//       .raw()
//       .toBuffer({ resolveWithObject: true })
//
//     tfImage = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], 'int32')
//
//     const m = await getModel()
//     const predictions = await m.classify(tfImage as any)
//
//     if (tfImage) {
//       tfImage.dispose()
//       tfImage = null
//     }
//
//     if (global.gc) {
//       global.gc()
//     }
//
//     const nsfwScore = predictions
//       .filter((p: any) => ['Porn', 'Hentai', 'Sexy'].includes(p.className))
//       .reduce((sum: number, p: any) => sum + p.probability, 0)
//
//     console.log(`[Moderation] Image ${url} score: ${nsfwScore.toFixed(2)}`)
//     return { score: nsfwScore, flagged: nsfwScore > 0.6 }
//   } catch (err) {
//     if (tfImage) {
//       tfImage.dispose()
//       tfImage = null
//     }
//     console.error(`[Moderation] Failed to analyze image ${url}:`, err)
//     return { score: 0.0, flagged: false }
//   }
// }

export interface ModerationResult {
  score: number;
  flagged: boolean;
}

export async function preloadModel(): Promise<void> {}

export async function analyzeImage(url: string): Promise<ModerationResult> {
  console.log(
    `[Moderation] Image analysis disabled on free tier, skipping: ${url}`,
  );
  return { score: 0.0, flagged: false };
}
