class VinylProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.L = null;
    this.R = null;
    this.len = 0;

    this.pos = 0; 
    this.rate = 0;
    this.mode = 'free';
    this.motor = 0;
    this.want = 0;

    this.gain = 1;
    this.jumpTo = null;

    this.maxRate = 6;
    this.sinceReport = 0;

    const sr = sampleRate;
    this.aHand = 1 - Math.exp(-1 / (0.012 * sr));
    this.aFree = 1 - Math.exp(-1 / (0.14 * sr));
    this.gStep = 1 / (0.006 * sr);

    this.port.onmessage = (e) => {
      const m = e.data;
      switch (m.type) {
        case 'load':
          this.L = m.L;
          this.R = m.R || m.L;
          this.len = this.L.length;
          this.pos = this.want = 0;
          break;
        case 'motor':
          this.motor = m.on ? 1 : 0;
          break;
        case 'hand':
          this.mode = 'hand';
          this.want = Math.max(0, Math.min(this.len - 1, m.pos * sampleRate));
          break;
        case 'release':
          this.mode = 'free';
          break;
        case 'jump':
          this.jumpTo = Math.max(0, Math.min(this.len - 1, m.pos * sampleRate));
          break;
      }
    };
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const outL = out[0];
    const outR = out[1] || out[0];
    const n = outL.length;

    if (!this.L) {
      outL.fill(0);
      if (outR !== outL) outR.fill(0);
      return true;
    }

    const L = this.L, R = this.R, last = this.len - 1;

    for (let i = 0; i < n; i++) {
      if (this.mode === 'hand') {
        let step = (this.want - this.pos) * this.aHand;
        if (step > this.maxRate) step = this.maxRate;
        else if (step < -this.maxRate) step = -this.maxRate;
        this.rate = step;
        this.pos += step;
      } else {
        this.rate += (this.motor - this.rate) * this.aFree;
        if (this.rate > this.maxRate) this.rate = this.maxRate;
        else if (this.rate < -this.maxRate) this.rate = -this.maxRate;
        this.pos += this.rate;
      }

      if (this.pos < 0) {
        this.pos = 0;
        if (this.rate < 0) this.rate = 0;
      } else if (this.pos >= last) {
        this.pos = last;
        if (this.mode === 'free' && this.rate > 0) {
          this.rate = 0;
          if (this.motor) {
            this.motor = 0;
            this.port.postMessage({ type: 'ended' });
          }
        } else if (this.rate > 0) {
          this.rate = 0;
        }
      }

      if (this.jumpTo !== null) {
        this.gain -= this.gStep;
        if (this.gain <= 0) {
          this.gain = 0;
          this.pos = this.want = this.jumpTo;
          this.jumpTo = null;
        }
      } else if (this.gain < 1) {
        this.gain = Math.min(1, this.gain + this.gStep);
      }

      const ip = this.pos | 0;
      const f = this.pos - ip;
      const i1 = ip < last ? ip + 1 : ip;
      outL[i] = (L[ip] + (L[i1] - L[ip]) * f) * this.gain;
      outR[i] = (R[ip] + (R[i1] - R[ip]) * f) * this.gain;
    }

    this.sinceReport += n;
    if (this.sinceReport >= 1024) {
      this.sinceReport = 0;
      this.port.postMessage({
        type: 'pos',
        t: currentTime,
        pos: this.pos / sampleRate,
        rate: this.rate,
      });
    }
    return true;
  }
}

registerProcessor('vinyl-processor', VinylProcessor);
