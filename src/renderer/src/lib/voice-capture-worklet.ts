/**
 * Registers the gf-voice-capture AudioWorklet (blob URL) and loads it on `ctx`.
 * Accumulates ~20ms PCM16 frames at the AudioContext sample rate and posts transferable ArrayBuffers.
 */
const WORKLET_SOURCE = `
class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    /** ~20ms at native sample rate */
    this.frameSamples = Math.max(128, Math.round(0.02 * sampleRate))
    this.acc = new Float32Array(0)
  }

  process(inputs) {
    const ch0 = inputs[0] && inputs[0][0]
    if (!ch0 || ch0.length === 0) return true

    const merged = new Float32Array(this.acc.length + ch0.length)
    merged.set(this.acc, 0)
    merged.set(ch0, this.acc.length)

    let pos = 0
    while (pos + this.frameSamples <= merged.length) {
      const slice = merged.subarray(pos, pos + this.frameSamples)
      const pcm = new Int16Array(this.frameSamples)
      for (let i = 0; i < this.frameSamples; i++) {
        const s = Math.max(-1, Math.min(1, slice[i]))
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer])
      pos += this.frameSamples
    }

    const rest = merged.length - pos
    this.acc = rest > 0 ? merged.slice(pos) : new Float32Array(0)
    return true
  }
}

registerProcessor('gf-voice-capture', VoiceCaptureProcessor)
`

export async function registerVoiceCaptureWorklet(ctx: AudioContext): Promise<void> {
  const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)
  try {
    await ctx.audioWorklet.addModule(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}
