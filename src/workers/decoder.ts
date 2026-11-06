import { decode, definition, identify } from "../dji/mappings";
import type { ExposureSample, Packet } from "../types";
import { MAX_PACKET, MAX_SAMPLES } from "../types/limits";

export { MAX_PACKET } from "../types/limits";

export class Decoder {
  samples: ExposureSample[] = [];
  protocol?: string;
  malformed = 0;
  warnings: string[] = [];

  decodeBatch(packets: Packet[]) {
    const samples: ExposureSample[] = [];
    if (this.samples.length + packets.length > MAX_SAMPLES)
      throw new Error("Metadata exceeds the 500,000 sample safety limit");
    for (const p of packets) {
      try {
        if (!Number.isFinite(p.timestamp) || !Number.isFinite(p.duration) || p.duration < 0)
          throw new Error("Invalid packet timing");
        if (p.data.byteLength > MAX_PACKET) throw new Error("Metadata packet exceeds 2 MiB limit");
        const protocol = identify(p.data);
        if (protocol && this.protocol && protocol !== this.protocol && this.warnings.length < 12)
          this.warnings.push(
            `Protocol changed from ${this.protocol} to ${protocol} at sample ${p.sourceIndex}.`,
          );
        if (protocol) this.protocol = protocol;
        samples.push(decode(p.data, this.protocol, p.timestamp, p.sourceIndex));
      } catch (e) {
        this.malformed++;
        if (this.warnings.length < 12)
          this.warnings.push(
            `Sample ${p.sourceIndex}: ${e instanceof Error ? e.message : String(e)}`,
          );
      }
    }
    this.samples.push(...samples);
    const def = definition(this.protocol);
    return {
      samples,
      protocol: this.protocol,
      camera: def?.camera ?? "Unknown DJI protocol",
      support: def ? def.support : "No exposure mapping applied.",
    };
  }

  finish() {
    this.samples.sort((a, b) => a.timestamp - b.timestamp || a.sourceIndex - b.sourceIndex);
    const warnings = [...this.warnings];
    if (this.malformed)
      warnings.push(`${this.malformed} malformed samples skipped; no values inferred for gaps.`);
    if (!this.samples.some((s) => s.iso !== undefined && s.shutterSeconds !== undefined))
      warnings.push("No mapped ISO/shutter pairs found.");
    return warnings;
  }
}
