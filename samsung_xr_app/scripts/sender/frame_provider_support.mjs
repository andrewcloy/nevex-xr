import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_FRAME_DIMENSIONS } from "./frame_provider_contract.mjs";

export const SUPPORTED_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
];

/**
 * Loads one local image file into a neutral sender-side frame object.
 *
 * @param {string} filePath
 * @param {object} [options]
 * @param {number} [options.width]
 * @param {number} [options.height]
 * @param {string} [options.sourceLabel]
 * @param {string} [options.title]
 * @param {string} [options.markerText]
 * @param {string} [options.backgroundHex]
 * @param {string} [options.accentHex]
 * @param {Readonly<Record<string, string | number | boolean>>} [options.metadata]
 * @returns {Promise<{
 *   bytes: Buffer,
 *   mimeType: string,
 *   byteSize: number,
 *   sourceLabel: string,
 *   width: number,
 *   height: number,
 *   title?: string,
 *   markerText?: string,
 *   backgroundHex?: string,
 *   accentHex?: string,
 *   metadata?: Readonly<Record<string, string | number | boolean>>,
 *   filePath?: string
 * }>}
 */
export async function loadImageFrameFromFile(filePath, options = {}) {
  const resolvedPath = path.resolve(filePath);
  const bytes = await fs.readFile(resolvedPath);

  return createImageFrameFromBuffer({
    bytes,
    mimeType: inferMimeType(resolvedPath),
    width: options.width ?? DEFAULT_FRAME_DIMENSIONS.width,
    height: options.height ?? DEFAULT_FRAME_DIMENSIONS.height,
    sourceLabel: options.sourceLabel ?? path.basename(resolvedPath),
    title: options.title,
    markerText: options.markerText,
    backgroundHex: options.backgroundHex,
    accentHex: options.accentHex,
    metadata: {
      ...(options.metadata ?? {}),
      fileName: path.basename(resolvedPath),
      filePath: resolvedPath,
    },
    filePath: resolvedPath,
  });
}

/**
 * Creates one neutral sender-side frame object from an SVG string.
 *
 * @param {string} svgText
 * @param {object} [options]
 * @param {number} [options.width]
 * @param {number} [options.height]
 * @param {string} [options.sourceLabel]
 * @param {string} [options.title]
 * @param {string} [options.markerText]
 * @param {string} [options.backgroundHex]
 * @param {string} [options.accentHex]
 * @param {Readonly<Record<string, string | number | boolean>>} [options.metadata]
 * @returns {{
 *   bytes: Buffer,
 *   mimeType: string,
 *   byteSize: number,
 *   sourceLabel: string,
 *   width: number,
 *   height: number,
 *   title?: string,
 *   markerText?: string,
 *   backgroundHex?: string,
 *   accentHex?: string,
 *   metadata?: Readonly<Record<string, string | number | boolean>>
 * }}
 */
export function createSvgImageFrame(svgText, options = {}) {
  return createImageFrameFromBuffer({
    bytes: Buffer.from(svgText, "utf8"),
    mimeType: "image/svg+xml",
    width: options.width ?? DEFAULT_FRAME_DIMENSIONS.width,
    height: options.height ?? DEFAULT_FRAME_DIMENSIONS.height,
    sourceLabel: options.sourceLabel ?? "generated_test_pattern.svg",
    title: options.title,
    markerText: options.markerText,
    backgroundHex: options.backgroundHex,
    accentHex: options.accentHex,
    metadata: options.metadata,
  });
}

/**
 * Lists supported image files in one directory.
 *
 * @param {string} directoryPath
 * @returns {Promise<string[]>}
 */
export async function listSupportedImageFiles(directoryPath) {
  const resolvedDirectory = path.resolve(directoryPath);
  const directoryEntries = await fs.readdir(resolvedDirectory, {
    withFileTypes: true,
  });

  return directoryEntries
    .filter((entry) => {
      return (
        entry.isFile() &&
        SUPPORTED_IMAGE_EXTENSIONS.includes(
          path.extname(entry.name).toLowerCase(),
        )
      );
    })
    .map((entry) => {
      return path.join(resolvedDirectory, entry.name);
    })
    .sort((leftPath, rightPath) => {
      return leftPath.localeCompare(rightPath, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
}

/**
 * Builds a protocol image payload from one neutral sender-side frame object.
 *
 * @param {{
 *   bytes: Buffer,
 *   mimeType: string
 * }} imageFrame
 * @param {"base64"|"data_url"|"binary_frame"} imageMode
 * @returns {{
 *   base64Data?: string,
 *   mimeType?: string,
 *   dataUrl?: string
 * } | undefined}
 */
export function createProtocolImagePayload(imageFrame, imageMode) {
  if (imageMode === "binary_frame") {
    return undefined;
  }

  const base64Data = imageFrame.bytes.toString("base64");
  if (imageMode === "data_url") {
    return {
      dataUrl: `data:${imageFrame.mimeType};base64,${base64Data}`,
    };
  }

  return {
    base64Data,
    mimeType: imageFrame.mimeType,
  };
}

/**
 * Infers the image MIME type from a local file path.
 *
 * @param {string} filePath
 * @returns {string}
 */
export function inferMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      throw new Error(
        `Unsupported image type for ${filePath}. Use png, jpg, jpeg, webp, or svg.`,
      );
  }
}

/**
 * Creates a neutral sender-side frame object from a raw image buffer.
 *
 * @param {object} options
 * @param {Buffer} options.bytes
 * @param {string} options.mimeType
 * @param {number} options.width
 * @param {number} options.height
 * @param {string} options.sourceLabel
 * @param {string} [options.title]
 * @param {string} [options.markerText]
 * @param {string} [options.backgroundHex]
 * @param {string} [options.accentHex]
 * @param {Readonly<Record<string, string | number | boolean>>} [options.metadata]
 * @param {string} [options.filePath]
 * @returns {{
 *   bytes: Buffer,
 *   mimeType: string,
 *   byteSize: number,
 *   sourceLabel: string,
 *   width: number,
 *   height: number,
 *   title?: string,
 *   markerText?: string,
 *   backgroundHex?: string,
 *   accentHex?: string,
 *   metadata?: Readonly<Record<string, string | number | boolean>>,
 *   filePath?: string
 * }}
 */
export function createImageFrameFromBuffer(options) {
  return {
    bytes: options.bytes,
    mimeType: options.mimeType,
    byteSize: options.bytes.byteLength,
    sourceLabel: options.sourceLabel,
    width: options.width,
    height: options.height,
    title: options.title,
    markerText: options.markerText,
    backgroundHex: options.backgroundHex,
    accentHex: options.accentHex,
    metadata: options.metadata,
    filePath: options.filePath,
  };
}
