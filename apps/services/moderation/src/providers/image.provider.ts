import * as nsfwjs from 'nsfwjs'
import * as tf from '@tensorflow/tfjs'
import axios from 'axios'
import sharp from 'sharp'

export interface ModerationResult {
    score: number
    flagged: boolean
}

let model: nsfwjs.NSFWJS | null = null

async function getModel() {
  if (!model) model = await nsfwjs.load()
  return model
}

export async function analyzeImage(url: string): Promise<ModerationResult> {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' })
    const { data, info } = await sharp(response.data)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const tfImage = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], 'int32')
    
    const m = await getModel()
    const predictions = await m.classify(tfImage as any)
    tfImage.dispose()
  
    const nsfwScore = predictions
      .filter((p: any) => ['Porn', 'Hentai', 'Sexy'].includes(p.className))
      .reduce((sum: number, p: any) => sum + p.probability, 0)
  
    console.log(`[Moderation] Image ${url} score: ${nsfwScore.toFixed(2)}`)
    return { score: nsfwScore, flagged: nsfwScore > 0.6 }
  } catch (err) {
    console.error(`[Moderation] Failed to analyze image ${url}:`, err)
    // Fail closed or open? Let's assume fail open (0.0) but log it so the post isn't stuck
    return { score: 0.0, flagged: false }
  }
}
