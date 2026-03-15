import { createFrameProviderStatus } from "../frame_provider_contract.mjs";
import { createSvgImageFrame } from "../frame_provider_support.mjs";

export class GeneratedTestPatternFrameProvider {
  constructor(options) {
    this.options = options;
    this.frameIndex = 0;
    this.status = createFrameProviderStatus({
      providerType: "generated",
      providerDisplayName: "Generated Test Pattern Frame Provider",
      detailText: "Ready to generate stereo test patterns.",
    });
  }

  async start() {
    this.frameIndex = 0;
    this.status = createFrameProviderStatus({
      ...this.status,
      state: "running",
      detailText: "Generating dynamic stereo SVG test patterns.",
      lastError: undefined,
    });
  }

  async stop() {
    this.status = createFrameProviderStatus({
      ...this.status,
      state: "stopped",
      detailText: "Generated test-pattern provider stopped.",
    });
  }

  getStatus() {
    return this.status;
  }

  async getNextStereoFrame() {
    if (this.status.state !== "running") {
      throw new Error("Generated test-pattern provider is not running.");
    }

    this.frameIndex += 1;
    const timestampMs = Date.now();
    const frameLabel = String(this.frameIndex).padStart(4, "0");

    this.status = createFrameProviderStatus({
      ...this.status,
      state: "running",
      lastFrameIndex: this.frameIndex,
      lastFrameTimestampMs: timestampMs,
      detailText: `Generated stereo test pattern ${frameLabel}.`,
    });

    return {
      frameIndex: this.frameIndex,
      timestampMs,
      providerType: "generated",
      overlayLabel: `Generated Frame ${frameLabel}`,
      tags: ["sender-prototype", "generated-provider", "test-pattern"],
      extras: {
        providerType: "generated",
        generator: "svg_test_pattern",
      },
      left: createSvgImageFrame(
        createTestPatternSvg({
          eye: "left",
          frameLabel,
          senderName: this.options.senderName,
          timestampMs,
        }),
        {
          width: this.options.frameWidth,
          height: this.options.frameHeight,
          sourceLabel: `generated-left-${frameLabel}.svg`,
          title: "Generated Test Pattern",
          markerText: `LEFT ${frameLabel}`,
          backgroundHex: "#0f385d",
          accentHex: "#9ee6ff",
          metadata: {
            providerType: "generated",
            generator: "svg_test_pattern",
          },
        },
      ),
      right: createSvgImageFrame(
        createTestPatternSvg({
          eye: "right",
          frameLabel,
          senderName: this.options.senderName,
          timestampMs,
        }),
        {
          width: this.options.frameWidth,
          height: this.options.frameHeight,
          sourceLabel: `generated-right-${frameLabel}.svg`,
          title: "Generated Test Pattern",
          markerText: `RIGHT ${frameLabel}`,
          backgroundHex: "#46185d",
          accentHex: "#f0c8ff",
          metadata: {
            providerType: "generated",
            generator: "svg_test_pattern",
          },
        },
      ),
    };
  }
}

function createTestPatternSvg(options) {
  const backgroundA = options.eye === "left" ? "#0f385d" : "#46185d";
  const backgroundB = options.eye === "left" ? "#2a81bb" : "#9c4cc2";
  const accent = options.eye === "left" ? "#9ee6ff" : "#f0c8ff";
  const eyeLabel = options.eye === "left" ? "LEFT TEST" : "RIGHT TEST";
  const orbitCx = options.eye === "left" ? 188 : 452;
  const timestampLabel = new Date(options.timestampMs).toISOString();

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${backgroundA}" />
          <stop offset="100%" stop-color="${backgroundB}" />
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#bg)" />
      <circle cx="${orbitCx}" cy="128" r="82" fill="rgba(255,255,255,0.15)" />
      <circle cx="${640 - orbitCx}" cy="228" r="58" fill="rgba(255,255,255,0.09)" />
      <rect x="76" y="228" width="488" height="62" rx="18" fill="rgba(0,0,0,0.30)" />
      <text x="320" y="82" text-anchor="middle" fill="${accent}" font-size="30" font-family="Segoe UI, Arial, sans-serif" font-weight="700">
        ${escapeXml(options.senderName.toUpperCase())}
      </text>
      <text x="320" y="158" text-anchor="middle" fill="#ffffff" font-size="74" font-family="Segoe UI, Arial, sans-serif" font-weight="800">
        ${eyeLabel}
      </text>
      <text x="320" y="256" text-anchor="middle" fill="#ffffff" font-size="24" font-family="Segoe UI, Arial, sans-serif">
        Frame ${options.frameLabel}
      </text>
      <text x="320" y="286" text-anchor="middle" fill="#ffffff" font-size="14" font-family="Segoe UI, Arial, sans-serif">
        ${escapeXml(timestampLabel)}
      </text>
    </svg>
  `;
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
